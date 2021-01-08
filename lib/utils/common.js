/*
 * SPDX-License-Identifier: GNU GENERAL PUBLIC LICENSE 2.0
 */

'use strict';

// Import lib
const hfc = require('fabric-client');
const promClient = require('prom-client');
const _ = require('lodash');
const yaml = require('js-yaml');
// const { Gateway } = require('fabric-network');

const { Gateway, Wallets } = require('fabric-network');
// const { Transaction } = require('fabric-network/lib/transaction');
// const Channel = require('fabric-common/lib/Channel');
const fs = require('fs');
const path = require('path');

const logger = require('./logger').getLogger('akc-node-sdk-common');

// Config
hfc.setLogger(logger);

// Declare sigleton variables
global.CLIENTS = {};
global.CHANNELS = {};
global.NETWORK = {};

/**
 * FUNCTION SECTION
 */

/**
 * Get an instance of client initialized with the network end points
 * @param {Client.Channel} channel
 */
const getDefaultEndorsermentPolicy = async (channel) => {
    const arrPeers = await channel.getChannelPeers();
    const endorsementPolicy = {};
    const identities = [];
    const policy = [];
    const listMSP = [];
    if (arrPeers.length > 0) {
        _.forEach(arrPeers, (value) => {
            listMSP.push(value.getMspid());
        });
        const uniqMSP = _.uniq(listMSP);
        for (let i = 0; i < uniqMSP.length; i += 1) {
            const identity = {};
            const role = {
                name: 'member',
                mspId: uniqMSP[i],
            };
            identity.role = role;
            identities.push(identity);
            policy.push({
                'signed-by': i,
            });
        }
        endorsementPolicy.identities = identities;
        const key = `${uniqMSP.length}-of`;
        endorsementPolicy.policy = {
            [key]: policy,
        };
    }
    return endorsementPolicy;
};

/**
 * Get an instance of client initialized with the network end points
 * @param {string} orgName
 * @param {boolean} isRefresh
 */
const getClientForOrg = async (orgName, userName, isRefresh) => {
    logger.debug('getClientForOrg - ****** START %s', orgName);

    // Check current singleton value
    if (!isRefresh && CLIENTS[userName]) {
        return CLIENTS[userName];
    }

    orgName = orgName || process.env.ORG_NAME;
    userName = userName || process.env.USER_NAME;

    const client = hfc.loadFromConfig(hfc.getConfigSetting(`network-connection-profile-path`));
    client.loadFromConfig(hfc.getConfigSetting(`${orgName}-connection-profile-path`));

    await client.initCredentialStores();

    // Load user context from memory, and check the state store.
    if (userName) {
        let user = await client.getUserContext(userName, true);
        if (!user) {
            user = client.getUserContext()
            if (!user) {
                throw new Error(util.format('User % was not found :', userName));
            } else {
                logger.debug("User % was not found, get previous user context instead. \n\n", userName);
            }
        } else {
            logger.debug('User %s of Org %s was found.\n\n', userName, orgName);
        }
    }

    // Set singleton value
    CLIENTS[userName] = client;

    return client;
}

/**
 * Get a Channel instance from the client instance.
 * @param {string} orgName 
 * @param {string} channelName 
 * @param {boolean} isRefresh Get new channel by channelName
 */
const getChannel = async (orgName, userName, channelName, isRefresh) => {
    logger.debug('getChannel - ****** START %s %s %s', orgName, channelName);

    // Check current singleton value
    if (!isRefresh && CHANNELS[userName]) {
        return CHANNELS[userName];
    }

    orgName = orgName || process.env.ORG_NAME;
    userName = userName || process.env.USER_NAME;
    channelName = channelName || process.env.CHANNEL_NAME;

    if (!CLIENTS[userName]) {
        CLIENTS[userName] = await getClientForOrg(orgName, userName);
    }

    CHANNELS[userName] = CLIENTS[userName].getChannel(channelName);
    return CHANNELS[userName];
};

/**
 * Get a Network instance from the client instance.
 * @param {string} channelName 
 * @param {string} userName 
 * @param {string} artifactFolder 
 * @param {boolean} isRefresh 
 */
const getNetwork = async (channelName, userName, artifactFolder, isRefresh) => {
    logger.debug('getNetwork - ****** START %s %s %s', channelName, userName);

    // Check current singleton value
    if (!isRefresh && NETWORK[channelName]) {
        return NETWORK[channelName];
    }
    // load the network configuration
    const file = 'network-config.yaml';

    const networkPath = path.join(artifactFolder, 'artifacts', file);
    const connectionProfile = yaml.safeLoad(fs.readFileSync(networkPath, 'utf8'));

    // Create a new file system based wallet for managing identities.
    const walletPath = path.join(artifactFolder, 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    // Check to see if we've already enrolled the user.
    const identity = await wallet.get(userName);
    if (!identity) {
        logger.debug(`An identity for the user ` + userName + ` does not exist in the wallet`);
        return;
    }
    // console.log(`identity: ${JSON.stringify(identity)}`);
    // Create a new gateway for connecting to our peer node.
    const gateway = new Gateway();

    // await gateway.connect(connectionProfile, connectionOptions);
    await gateway.connect(connectionProfile, { wallet, identity: userName, discovery: { enabled: true, asLocalhost: false } });

    // Get the network (channel) our contract is deployed to.
    NETWORK[channelName] = await gateway.getNetwork(channelName);
    return NETWORK[channelName];
};

/**
 * Declare prometheus' Histograms and Counters to measure duration metrics when sending the request.
 */
const requestCounter = new promClient.Counter({
    name: 'akc_request_count',
    help: 'Counter of requests'
}),
    sendTransactionTotalHistogram = new promClient.Histogram({
        name: 'akc_send_transaction_total_duration',
        help: 'Histogram of send transaction total duration',
        labelNames: ['channel', 'chaincode', 'function']
    }),
    sendProposalHistogram = new promClient.Histogram({
        name: 'akc_send_proposal_duration',
        help: 'Histogram of send proposal duration',
        labelNames: ['channel', 'chaincode', 'function']
    }),
    sendTransactionHistogram = new promClient.Histogram({
        name: 'akc_send_transaction_duration',
        help: 'Histogram of send transaction duration',
        labelNames: ['channel', 'chaincode', 'function']
    }),
    errorRequestCounter = new promClient.Counter({
        name: 'akc_error_request_count',
        help: 'Counter of error requests'
    });

/**
 * Create Return for Dapp
 * @param {string} Status 
 * @param {string} Payload 
 * @param {string} Message 
 * @param {string} MessageDetail 
 */
const createReturn = (Status, Payload, Message, MessageDetail) => {
    return {
        Result: {
            Status,
            Payload,
        },
        Message,
        MessageDetail,
    };
}

exports.getDefaultEndorsermentPolicy = getDefaultEndorsermentPolicy;
exports.getClientForOrg = getClientForOrg;
exports.getChannel = getChannel;
exports.getNetwork = getNetwork;
exports.requestCounter = requestCounter;
exports.sendTransactionTotalHistogram = sendTransactionTotalHistogram;
exports.sendProposalHistogram = sendProposalHistogram;
exports.sendTransactionHistogram = sendTransactionHistogram;
exports.errorRequestCounter = errorRequestCounter;
exports.createReturn = createReturn;