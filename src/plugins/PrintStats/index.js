'use strict'

import { registerRoute } from '@/routes'

import PrintStats from './PrintStats.vue'

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
