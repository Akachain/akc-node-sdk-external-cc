/*
 * SPDX-License-Identifier: GNU GENERAL PUBLIC LICENSE 2.0
 */

'use strict';

// Import lib
// const util = require('util');

const logger = require('../utils/logger').getLogger('invoke-service')
const common = require('../utils/common')
const yaml = require('js-yaml');
// const { Gateway } = require('fabric-network');

const { Gateway, Wallets } = require('fabric-network');
const { Transaction } = require('fabric-network/lib/transaction');
const Channel = require('fabric-common/lib/Channel');
const fs = require('fs');
const path = require('path');
const re = /message=(.*?)\n/;
/**
 * InvokeService class provide 'invokeChaincode' function to request a invoked-transaction.
 * It also integrates with 'prom-client' to measure duration metrics when sending the request.
 */
class InvokeService {
    constructor() { }

    /**
     * invokeChaincode sends a proposal to one or more endorsing peers that will be handled by the chaincode
     * @param {string} peerNames 
     * @param {string} channelName 
     * @param {[]string} endorsingPeer 
     * @param {string} chaincodeName 
     * @param {string} fcn 
     * @param {string} args 
     * @param {string} orgName 
     * @param {string} userName 
     */
    async invokeChaincode(channelName, endorsingPeer, chaincodeName, fcn, args, orgName, userName) {
        try {
            // load the network configuration

            const connectionProfile = yaml.safeLoad(fs.readFileSync('./artifacts/network-config.yaml', 'utf8'));
            // const ccpPath = path.join(__dirname, '..', '..', 'artifacts', 'connection-' + orgName + '.json');
            // let ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

            // Create a new file system based wallet for managing identities.
            const walletPath = path.join(__dirname, '..', '..', 'wallet');
            const wallet = await Wallets.newFileSystemWallet(walletPath);
            console.log(`Wallet path: ${walletPath}`);

            // Check to see if we've already enrolled the user.
            const identity = await wallet.get(userName);
            if (!identity) {
                console.log(`An identity for the user ` + userName + ` does not exist in the wallet`);
                return;
            }

            // Create a new gateway for connecting to our peer node.
            const gateway = new Gateway();

            // await gateway.connect(connectionProfile, connectionOptions);
            await gateway.connect(connectionProfile, { wallet, identity: userName, discovery: { enabled: false, asLocalhost: false } });

            // Get the network (channel) our contract is deployed to.
            const network = await gateway.getNetwork(channelName);

            // Get the contract from the network.
            const contract = network.getContract(chaincodeName);

            try {
                // const channel = network.getChannel();
                // const endorsingPeer = ;
                // await contract.createTransaction().setEndorsingPeers(endorsingPeer);
                // let transaction = new Transaction(contract, 'TRANSACTION_NAME');
                // await transaction.setEndorsingPeers(endorsingPeer).submit(...args);
                let result = null;
                if (endorsingPeer == []) {
                    network.discoveryService = true;
                    result = await contract.submitTransaction(fcn, args);
                } else {
                    network.discoveryService = false;
                    result = await contract.createTransaction(fcn).setEndorsingPeers(endorsingPeer).submit(args);
                }
                let returnObj = JSON.parse(result.toString('utf8'));
                // logger.info('result: ', result);
                logger.info(`Transaction has been evaluated, result is: ${returnObj.Status}`);
                return returnObj;
            } catch (err) {
                // logger.error('ERROR: ', err);
                let jsonErr = JSON.stringify(err, Object.getOwnPropertyNames(err));
                // logger.error('jsonErr: ', jsonErr);
                let objErr = JSON.parse(jsonErr);
                // logger.error('objErr: ', objErr.message);
                let arr = objErr.message.split("\n")
                logger.error('arr: ', arr);
                for (let i = 1; i < arr.length; i += 1) {
                    let msg = arr[i].split("message=");
                    // logger.error('element.split("message="): ', msg[1]);
                    try {
                        let errObj = JSON.parse(msg[1]);
                        // logger.error('returnObj: ', returnObj);
                        return common.createReturn(errObj.status, "", errObj.msg,"");
                    } catch (err) {
                        // logger.error('returnObj: ', msg[1]);
                        return common.createReturn('500', "", msg, msg);
                    }
                }
                // let jsonMsg = JSON.stringify(objErr.message, Object.getOwnPropertyNames("message"))
                // logger.info(jsonMsg);
                // let objMsg = JSON.parse(jsonMsg);
                // logger.info(objMsg.message);
                // let errorObject = JSON.parse(objErr.message.toString('utf8'))
            }

            // Disconnect from the gateway.
            // await gateway.disconnect();.
            return null
        } catch (error) {
            console.error(`Failed to submit transaction: ${error}`);
            process.exit(1);
        }
    }
}

module.exports = InvokeService;