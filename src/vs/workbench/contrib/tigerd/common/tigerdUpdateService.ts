/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/
/*--------------------------------------------------------------------------------------
 *  Tigerd — based on Tigerd Editor by Glass Devtools, Inc.
 *  Modifications Copyright 2026 Miiglu. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/


import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { TigerdCheckUpdateRespose } from './tigerdUpdateServiceTypes.js';



export interface ITigerdUpdateService {
	readonly _serviceBrand: undefined;
	check: (explicit: boolean) => Promise<TigerdCheckUpdateRespose>;
}


export const ITigerdUpdateService = createDecorator<ITigerdUpdateService>('TigerdUpdateService');


// implemented by calling channel
export class TigerdUpdateService implements ITigerdUpdateService {

	readonly _serviceBrand: undefined;
	private readonly tigerdUpdateService: ITigerdUpdateService;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService, // (only usable on client side)
	) {
		// creates an IPC proxy to use metricsMainService.ts
		this.tigerdUpdateService = ProxyChannel.toService<ITigerdUpdateService>(mainProcessService.getChannel('tigerd-channel-update'));
	}


	// anything transmitted over a channel must be async even if it looks like it doesn't have to be
	check: ITigerdUpdateService['check'] = async (explicit) => {
		const res = await this.tigerdUpdateService.check(explicit)
		return res
	}
}

registerSingleton(ITigerdUpdateService, TigerdUpdateService, InstantiationType.Eager);


