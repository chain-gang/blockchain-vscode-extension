/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/
'use strict';
import { VSCodeBlockchainOutputAdapter } from '../logging/VSCodeBlockchainOutputAdapter';
import { GatewayDissociatedTreeItem } from '../explorer/model/GatewayDissociatedTreeItem';
import { LogType } from '../logging/OutputAdapter';
import { FabricGatewayRegistryEntry } from '../fabric/FabricGatewayRegistryEntry';
import { IBlockchainQuickPickItem, UserInputUtil } from './UserInputUtil';
import { FabricWalletRegistryEntry } from '../fabric/FabricWalletRegistryEntry';
import { FabricGatewayRegistry } from '../fabric/FabricGatewayRegistry';
import { FabricWalletRegistry } from '../fabric/FabricWalletRegistry';
import { FabricRuntimeUtil } from '../fabric/FabricRuntimeUtil';
import { FabricWalletUtil } from '../fabric/FabricWalletUtil';

export async function associateWallet(gatewayTreeItem: GatewayDissociatedTreeItem): Promise<any> {
    const outputAdapter: VSCodeBlockchainOutputAdapter = VSCodeBlockchainOutputAdapter.instance();
    outputAdapter.log(LogType.INFO, undefined, 'associateWallet');

    let gateway: FabricGatewayRegistryEntry;

    if (!gatewayTreeItem) {
        // If called from command palette

        // Ask for gateway
        // Check there is at least one that is not local_fabric
        let gateways: Array<FabricGatewayRegistryEntry> = [];
        gateways = FabricGatewayRegistry.instance().getAll();
        if (gateways.length === 0) {
            outputAdapter.log(LogType.ERROR, `Add a gateway to associate a wallet. ${FabricRuntimeUtil.LOCAL_FABRIC} is associated with ${FabricWalletUtil.LOCAL_WALLET}.`, `Add a gateway to associate a wallet. ${FabricRuntimeUtil.LOCAL_FABRIC} is associated with ${FabricWalletUtil.LOCAL_WALLET}.`);
            return;
        }
        const chosenGateway: IBlockchainQuickPickItem<FabricGatewayRegistryEntry> = await UserInputUtil.showGatewayQuickPickBox('Pick a gateway to associate a wallet with', false, false);
        if (!chosenGateway) {
            return;
        }
        gateway = chosenGateway.data;
    } else {
        // If called using tree item
        gateway = gatewayTreeItem.gateway;
    }

    // Get a wallet to associate
    // Check there is at least one that is not local_fabric_wallet
    let wallets: Array<FabricWalletRegistryEntry> = [];
    wallets = FabricWalletRegistry.instance().getAll();
    if (wallets.length === 0) {
        outputAdapter.log(LogType.ERROR, `You must first add a wallet, to then associate with this gateway`);
        return;
    }
    const chosenWallet: IBlockchainQuickPickItem<FabricWalletRegistryEntry> = await UserInputUtil.showWalletsQuickPickBox('Choose a wallet to associate with this gateway', false);
    if (!chosenWallet) {
        return;
    }

    const associatedWallet: string = chosenWallet.label;

    try {
        // Associate the wallet using the wallets name
        const fabricGatewayRegistry: FabricGatewayRegistry = FabricGatewayRegistry.instance();
        gateway.associatedWallet = associatedWallet;
        await fabricGatewayRegistry.update(gateway);

    } catch (error) {
        outputAdapter.log(LogType.ERROR, `Unable to associate wallet: ${error.message}`, `Unable to associate wallet: ${error.toString()}`);
        throw new Error(`Unable to associate wallet: ${error.message}`);
    }

    outputAdapter.log(LogType.SUCCESS, `Successfully associated "${associatedWallet}" wallet with "${gateway.name}" gateway`);
}
