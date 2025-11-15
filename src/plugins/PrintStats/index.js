'use strict'

import { registerCategory, registerSettingTab } from '../../routes'
import { registerRoute } from '@/routes'

import PrintStats from './PrintStats.vue'
import PrintStatSettings from './PrintStatSettings.vue'

registerSettingTab(false, 'mdi-chart-areaspline', PrintStatSettings, 'Print Stats');

registerRoute(PrintStats, {
	Plugins: {
		PrintStats: {
			icon: 'mdi-chart-areaspline',
			caption: 'Print Stats',
			translated: false,
			path: '/PrintStats'
		}
	}
});
