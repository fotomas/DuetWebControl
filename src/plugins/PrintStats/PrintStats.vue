<template>
	<v-simple-table>
		<template #default>
			<v-btn  @click="loadStats">Load Stats</v-btn>
			<!-- show parsed results -->
			<tr>
				<td>No. finished prints (warn)</td>
				<td>{{ noOfFinishedPrints }}</td>
			</tr>
			<tr>
				<td>No. cancelled prints (warn)</td>
				<td>{{ noOfCancelledPrints }}</td>
			</tr>
		</template>
	</v-simple-table>
</template>

<script>
'use strict'

import { mapState, mapActions } from 'vuex';

export default {
	computed: {
		// expose systemDirectory from the store if present
		
		...mapState('machine/model', {
			systemDirectory: (state) => state.directories.system
		}),
	},
	data(){
		return{
			files: [],
			selectedFile: '_eventlog.txt',
			loadingFiles: false,
			isActive: true,
			ready: false,
			loading: false,
			errorMessage: null,
			// new counters
			noOfFinishedPrints: 0,
			noOfCancelledPrints: 0,
		}
	},
	methods: {
		...mapActions('machine', ['download', 'getFileList']),
		// Small local path join utility to avoid relying on a global Path
		combinePaths(dir, file) {
			if (!dir) return file || ''
			if (!file) return dir
			// ensure single slash between dir and file
			const sep = dir.endsWith('/') || dir.endsWith('\\') ? '' : '/'
			return `${dir}${sep}${file}`
		},
 		async loadStats() {
 			if (this.loading) {
 				// Don't attempt to load more than one file at once...
 				return;
 			}
 
 			this.ready = false;
 			this.loading = true;
 			try {
				console.log(this.combinePaths(this.systemDirectory, this.selectedFile));
 
 				if (this.selectedFile) {
 					const stats = await this.download({
 						filename: this.combinePaths(this.systemDirectory, this.selectedFile),
 						type: 'text',
 						showProgress: true,
 						showSuccess: true,
 						showError: true,
 					});
					this.showStats(stats);
 				} else {
 					this.errorMessage = null;
 				}
 			} catch (e) {
 				console.warn(e);
 				this.errorMessage = e.message;
 			}
 			this.loading = false;
 			this.ready = true;
 		},
		showStats(stats) {
			// stats may be a string or an object depending on download implementation
			const text = typeof stats === 'string'
				? stats
				: (stats && (stats.data || stats.text)) ? (stats.data || stats.text) : String(stats);

			const lines = text.split(/\r?\n/);
			let finished = 0;
			let cancelled = 0;
			for (const line of lines) {
				if (!line) continue;
				if (line.includes('[warn]')) {
					const lc = line.toLowerCase();
					if (lc.includes('finished')) finished++;
					// handle both american and british spellings
					if (lc.includes('cancelled') || lc.includes('canceled')) cancelled++;
				}
			}
			this.noOfFinishedPrints = finished;
			this.noOfCancelledPrints = cancelled;
			// keep original event for any external listeners
			this.$emit('show-stats', { raw: text, noOfFinishedPrints: finished, noOfCancelledPrints: cancelled });
		}
 	}
 }
</script>