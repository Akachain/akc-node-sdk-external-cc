/*
 * SPDX-License-Identifier: GNU GENERAL PUBLIC LICENSE 2.0
 */

'use strict';

// Import lib
const logger = require('../utils/logger').getLogger('invoke-service')
const common = require('../utils/common')

/**
 * InvokeService class provide 'invokeChaincode' function to request a invoked-transaction.
 * It also integrates with 'prom-client' to measure duration metrics when sending the request.
 */
class InvokeService {
    constructor() { }

    /**
     * invokeChaincode sends a proposal to one or more endorsing peers that will be handled by the chaincode
     * @param {string} channelName 
     * @param {[]string} endorsingPeer 
     * @param {string} chaincodeName 
     * @param {string} fcn 
     * @param {string} args 
     * @param {string} orgName 
     * @param {string} userName 
     * @param {string} artifactFolder 
     */
    async invokeChaincode(channelName, endorsingPeer, chaincodeName, fcn, args, orgName, userName, artifactFolder) {
        try {
            // Get the network (channel) our contract is deployed to.
            const network = await common.getNetwork(channelName, userName, artifactFolder, false);

            // Get the contract from the network.
            const contract = network.getContract(chaincodeName);

            const transaction = contract.createTransaction(fcn);
            if (endorsingPeer != []) {
                network.discoveryService = false;
                transaction.setEndorsingPeers(endorsingPeer)
            }
            try {
                let result = await transaction.submit(...args);
                let returnObj = result.toString('utf8');
                return common.createReturn(200, returnObj, '', '');
            } catch (err) {
                logger.error('ERROR: ', err);
                let jsonErr = JSON.stringify(err, Object.getOwnPropertyNames(err));
                let objErr = JSON.parse(jsonErr);
                let arr = objErr.message.split("\n")
                for (let i = 1; i < arr.length; i += 1) {
                    try {
                        let msg = arr[i].split("message=");
                        let errObj = JSON.parse(msg[1]);
                        return common.createReturn(errObj.status, "", errObj.msg, "");
                    } catch (err) {
                        return common.createReturn(500, "", arr, arr);
                    }
                }
            }

            // Disconnect from the gateway.
            // await gateway.disconnect();.
        } catch (error) {
            return common.createReturn(500, "", 'Failed to submit transaction', error);
        }
    }
}

module.exports = InvokeService;