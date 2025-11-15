<template>
	<v-card>
		<v-card-title>
			<div style="display:flex;width:100%;align-items:center;">
				<!-- left: heading -->
				<div style="flex:1">
					<div class="heading">Print Statistics</div>
				</div>
				<!-- right: controls -->
				<div style="display:flex;align-items:center;gap:12px;">
					<v-select
						v-model="selectedFile"
						:items="files"
						label="Select log file"
						style="max-width:300px;"
						dense
						hide-details
					/>
					<v-btn color="success" @click="loadStats">
						<v-icon left>mdi-play</v-icon>
						Load Stats
					</v-btn>
				</div>
			</div>
		</v-card-title>
		<!-- overlay bound to loading -->
		<v-overlay :value="loading" absolute>
			<v-progress-circular indeterminate size="48" color="white"></v-progress-circular>
		</v-overlay>
 		<v-simple-table>
			<template #default>
				<tr>
					<td colspan="1" rowspan="3">
					<!-- Pie chart: finished vs cancelled ratio -->
						<div style="width:100%;overflow:hidden;max-width:300px;">
							<canvas ref="ratioChart" style="display:block;width:100%;height:200px;max-width:100%;box-sizing:border-box"></canvas>
						</div>
					</td>
					<td class="ps-value">{{ noOfFinishedPrints }}</td>
					<td class="ps-label">Finished prints, in total</td>
					<td class="ps-value">{{ noOfCancelledPrints }}</td>
					<td class="ps-label">Cancelled prints</td>
				</tr>
				<tr>
					<td class="ps-value">{{ finishedLastYear }}</td>
					<td class="ps-label">Finished (last rolling year)</td>
					<td class="ps-value">{{ busiestWeekCount }} </td>
					<td class="ps-label">Busiest week, ({{ busiestWeek }} )</td>
				</tr>
				<tr>
					<td class="ps-value">{{ avgPrintTimeFormatted }}</td>
					<td class="ps-label">Average print</td>
					<td class="ps-value">{{ longestPrintTimeFormatted }}</td>
					<td class="ps-label">Longest print</td>
				</tr>
				<tr>
 				<td colspan="6">
 					<!-- ensure the canvas never grows larger than its container -->
 					<div style="width:100%;overflow:hidden;">
 						<canvas ref="weekChart" style="display:block;width:100%;height:300px;max-width:100%;box-sizing:border-box"></canvas>
 					</div>
 				</td>
 			</tr>
			</template>
		</v-simple-table>
	</v-card>
</template>

<script>
'use strict'

import { mapState, mapActions } from 'vuex';
import Chart from 'chart.js';

export default {
	computed: {
		// expose systemDirectory from the store if present
		...mapState('machine/model', {
			systemDirectory: (state) => state.directories.system
		}),
		avgPrintTimeFormatted() {
			return this.formatMinutesToHoursMinutes(this.avgPrintTimeMinutes);
		},
		longestPrintTimeFormatted() {
			return this.formatMinutesToHoursMinutes(this.longestPrintTimeMinutes);
		}
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
			// per-week data for chart
			weeklyLabels: [],
			finishedPerWeek: [],
			cancelledPerWeek: [],
			totalPrintTimePerWeek: [],
			// new stats
			finishedLastYear: 0,
			busiestWeek: '',
			busiestWeekCount: 0,
			avgPrintTimeMinutes: 0,
			longestPrintTimeMinutes: 0,
			// Chart.js instance
			chartInstance: null,
			ratioChartInstance: null,
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
		// ISO week number and week-key helpers
		isoWeekKeyFromDate(d) {
			// returns YYYY-WW
			const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
			// Thursday in current week decides the year.
			date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay()||7));
			const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
			const weekNo = Math.floor(( (date - yearStart) / 86400000 + 1)/7) + 1;
			const ww = String(weekNo).padStart(2,'0');
			return `${date.getUTCFullYear()}-${ww}`;
		},
		weekLabelFromKey(key) {
			// convert "YYYY-WW" to an approximate week-start label: Monday of that ISO week
			const [y, w] = key.split('-').map(Number);
			// Calculate Monday of ISO week:
			const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
			// adjust to Monday
			const day = simple.getUTCDay() || 7;
			const monday = new Date(simple);
			monday.setUTCDate(simple.getUTCDate() - (day - 1));
			return monday.toISOString().slice(0,10);
		},
		async fetchFileList() {
			this.loading = true;
			try {
				console.log("systemDirectory");
				console.log(this.systemDirectory);

				const files = await this.getFileList(this.systemDirectory);
				this.files = files
					.filter(file => !file.isDirectory && (file.name.endsWith('.txt') || file.name.endsWith('.log')))
					.map(file => file.name)
					.sort();
			} finally {
				this.loading = false;
			}
		},
 		async loadStats() {
 			if (this.loading) {
 				// Don't attempt to load more than one file at once...
 				return;
 			}
 
 			this.ready = false;
 			this.loading = true;
 			try {
				console.log(this.systemDirectory);
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
		// helper to convert minutes to "Xh YYm" format
		formatMinutesToHoursMinutes(minutes) {
			if (minutes <= 0) return '—';
			const h = Math.floor(minutes / 60);
			const m = Math.round(minutes % 60);
			return `${h}h ${m}m`;
		},
		// parse print time from finished line, e.g. "print time was 0h 48m"
		extractPrintTimeMinutes(line) {
			const match = line.match(/print time was (\d+)h\s*(\d+)m/i);
			if (match) {
				const h = parseInt(match[1], 10);
				const m = parseInt(match[2], 10);
				return h * 60 + m;
			}
			return null;
		},
		showStats(stats) {
			// stats may be a string or an object depending on download implementation
			const text = typeof stats === 'string'
				? stats
				: (stats && (stats.data || stats.text)) ? (stats.data || stats.text) : String(stats);

			const lines = text.split(/\r?\n/);
			// maps keyed by ISO week "YYYY-WW"
			const finishedMap = Object.create(null);
			const cancelledMap = Object.create(null);
			const printTimePerWeekMap = Object.create(null);
			let totalFinished = 0;
			let totalCancelled = 0;
			// new: track print times and last-year finished
			const printTimes = [];
			let finishedLastYearCount = 0;
			const now = new Date();
			const oneYearAgo = new Date(now);
			oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

			const tsRe = /^(\d{4}-\d{2}-\d{2})/; // match lines starting with YYYY-MM-DD
			for (const rawLine of lines) {
				if (!rawLine) continue;
				const line = rawLine.trim();
				// only consider lines that start with a date timestamp
				const m = tsRe.exec(line);
				if (!m) continue;
				const dateStr = m[1];
				const lc = line.toLowerCase();
				if (!lc.includes('[warn]')) continue; // per requirement use warn-level rows
				const isFinished = lc.includes('finished');
				const isCancelled = lc.includes('cancelled') || lc.includes('canceled');
				if (!isFinished && !isCancelled) continue;
				// parse date (YYYY-MM-DD) -> Date
				const d = new Date(dateStr + 'T00:00:00Z');
				if (Number.isNaN(d.getTime())) continue;
				const key = this.isoWeekKeyFromDate(d);
				if (isFinished) {
					finishedMap[key] = (finishedMap[key] || 0) + 1;
					totalFinished++;
					// track last-year finished
					if (d >= oneYearAgo) finishedLastYearCount++;
					// extract print time if available
					const printMin = this.extractPrintTimeMinutes(line);
					if (printMin !== null) {
						printTimes.push(printMin);
						// accumulate print time per week
						printTimePerWeekMap[key] = (printTimePerWeekMap[key] || 0) + printMin;
					}
 				}
 				if (isCancelled) {
 					cancelledMap[key] = (cancelledMap[key] || 0) + 1;
 					totalCancelled++;
 				}
 			}

 			// merge week keys and sort
 			const keys = Array.from(new Set(Object.keys(finishedMap).concat(Object.keys(cancelledMap))));
 			keys.sort(); // lexical sort YYYY-WW works

 			this.weeklyLabels = keys.map(k => this.weekLabelFromKey(k));
 			this.finishedPerWeek = keys.map(k => finishedMap[k] || 0);
 			this.cancelledPerWeek = keys.map(k => cancelledMap[k] || 0);
 			this.totalPrintTimePerWeek = keys.map(k => Math.round(printTimePerWeekMap[k] || 0) / 60); // convert to hours
 			this.noOfFinishedPrints = totalFinished;
 			this.noOfCancelledPrints = totalCancelled;
 			this.finishedLastYear = finishedLastYearCount;

			// find busiest week
			let maxWeekCount = 0;
			let busiestKey = '';
			for (const key of keys) {
				const count = (finishedMap[key] || 0) + (cancelledMap[key] || 0);
				if (count > maxWeekCount) {
					maxWeekCount = count;
					busiestKey = key;
				}
			}
			this.busiestWeek = busiestKey ? this.weekLabelFromKey(busiestKey) : '—';
			this.busiestWeekCount = maxWeekCount;

			// calculate print time stats
			if (printTimes.length > 0) {
				this.longestPrintTimeMinutes = Math.max(...printTimes);
				const avg = printTimes.reduce((a,b) => a+b, 0) / printTimes.length;
				this.avgPrintTimeMinutes = avg;
			} else {
				this.longestPrintTimeMinutes = 0;
				this.avgPrintTimeMinutes = 0;
			}

 			// draw charts (Chart.js)
 			this.$nextTick(() => {
				this.renderRatioChart();
 				this.renderChart();
 			});

 			// keep original event for any external listeners
 			this.$emit('show-stats', {
 				raw: text,
 				noOfFinishedPrints: totalFinished,
 				noOfCancelledPrints: totalCancelled,
 				weekly: {
 					labels: this.weeklyLabels,
 					finished: this.finishedPerWeek,
 					cancelled: this.cancelledPerWeek
 				}
 			});
 		},
		// render pie chart showing finished vs cancelled ratio
		renderRatioChart() {
			const canvas = this.$refs.ratioChart;
			if (!canvas) return;
			canvas.style.display = 'block';
			canvas.style.width = '100%';
			canvas.style.maxWidth = '100%';
			canvas.style.boxSizing = 'border-box';
			if (canvas.parentElement) canvas.parentElement.style.overflow = 'hidden';
			const ctx = canvas.getContext('2d');

			const data = {
				labels: ['Finished', 'Cancelled'],
				datasets: [{
					data: [this.noOfFinishedPrints, this.noOfCancelledPrints],
					backgroundColor: ['#2c7be5', '#e74c3c'],
					borderColor: ['#1e5ba8', '#c0392b'],
					borderWidth: 1
				}]
			};

			const options = {
				responsive: true,
				maintainAspectRatio: false,
				legend: { display: true, position: 'top' },
				//cutoutPercentage: 30,
			};

			if (this.ratioChartInstance) {
				this.ratioChartInstance.data = data;
				this.ratioChartInstance.options = options;
				this.ratioChartInstance.update();
				if (typeof this.ratioChartInstance.resize === 'function') this.ratioChartInstance.resize();
			} else {
				this.ratioChartInstance = new Chart(ctx, {
					type: 'pie',
					data,
					options
				});
				if (typeof this.ratioChartInstance.resize === 'function') this.ratioChartInstance.resize();
			}
		},
 		// render or update Chart.js line chart
 		renderChart() {
 			const canvas = this.$refs.weekChart;
 			if (!canvas) return;
 			// enforce CSS sizing so Chart.js measures correct clientWidth (prevents overflow / double-size)
 			canvas.style.display = 'block';
 			canvas.style.width = '100%';
 			canvas.style.maxWidth = '100%';
 			canvas.style.boxSizing = 'border-box';
 			if (canvas.parentElement) canvas.parentElement.style.overflow = 'hidden';
 			const ctx = canvas.getContext('2d');

 			const data = {
 				labels: this.weeklyLabels,
 				datasets: [
 					{
 						label: 'Finished per week',
 						data: this.finishedPerWeek,
 						borderColor: '#2c7be5',
 						backgroundColor: 'rgba(44,123,229,0.08)',
 						fill: false,
 						lineTension: 0.1,
 					},
 					{
 					 label: 'Cancelled per week',
 					 data: this.cancelledPerWeek,
 					 borderColor: '#e74c3c',
 					 backgroundColor: 'rgba(231,76,60,0.08)',
 					 fill: false,
 					 lineTension: 0.1,
 					},
 					{
 						label: 'Print time per week',
 						data: this.totalPrintTimePerWeek,
 						borderColor: '#27ae60',
 						backgroundColor: 'rgba(39,174,96,0.08)',
 						fill: false,
 						lineTension: 0.1,
 						yAxisID: 'y-axis-1'
 					}
 				]
 			};

 			const options = {
 				responsive: true,
 				maintainAspectRatio: false,
 				legend: { display: true },
				// custom tooltip formatting: show total print time as "Hh Mm"
				tooltips: {
					callbacks: {
						label: function(tooltipItem, data) {
							const ds = data.datasets[tooltipItem.datasetIndex] || {};
							const label = ds.label || '';
							// detect total print time dataset by label
							if (/total print time/i.test(label)) {
								// tooltipItem.yLabel is in hours (may be fractional) — convert to minutes
								const minutes = Math.round((tooltipItem.yLabel || 0) * 60);
								const h = Math.floor(minutes / 60);
								const m = minutes % 60;
								return label + ': ' + (h > 0 ? h + 'h ' : '') + m + 'm';
							}
							// default formatting for other datasets
							return label + ': ' + tooltipItem.yLabel;
						}
					}
				},
 				scales: {
 					yAxes: [
 						{
 							id: 'y-axis-0',
 							position: 'left',
 							ticks: { beginAtZero: true, precision: 0 }
 						},
 						{
 							id: 'y-axis-1',
 							position: 'right',
 							ticks: { beginAtZero: true }
 						}
 					],
 					xAxes: [{
 						ticks: {
 							autoSkip: true,
 							maxRotation: 0,
 							minRotation: 0,
 							callback: function(value, index, labels) {
 								// format "YYYY-MM-DD" as "YY-MM"
 								if (value && value.length >= 5) {
 									return value.slice(2, 7); // "YY-MM"
 								}
 								return value;
 							}
 						}
 					}]
 				}
 			};

 			if (this.chartInstance) {
 				this.chartInstance.data = data;
 				this.chartInstance.options = options;
 				this.chartInstance.update();
 				// ensure Chart.js recomputes internal canvas size
 				if (typeof this.chartInstance.resize === 'function') this.chartInstance.resize();
 			} else {
 				this.chartInstance = new Chart(ctx, {
 					type: 'line',
 					data,
 					options
 				});
 				// initial resize to match container exactly
 				if (typeof this.chartInstance.resize === 'function') this.chartInstance.resize();
 			}
 		}
 	},
 	mounted() {
 		this.fetchFileList();
 	},
 	beforeDestroy() {
 		if (this.chartInstance) {
 			this.chartInstance.destroy();
 			this.chartInstance = null;
 		}
		if (this.ratioChartInstance) {
			this.ratioChartInstance.destroy();
			this.ratioChartInstance = null;
		}
 	},
 }
</script>

<style scoped>
/* values: large, bold, right-aligned, bottom-aligned */
.ps-value {
	font-size: 3.0rem;
	font-weight: 1000;
	text-align: right;
	vertical-align: bottom;
	padding: 6px 8px;
	color: #DDD;
	padding-top: 0%;
	padding-bottom: 0%;
	padding-right: 4px;
}

/* labels: smaller, left-aligned, bottom-aligned */
.ps-label {
	font-size: 0.85rem; /* smaller */
	text-align: left;
	vertical-align: bottom;
	padding: 6px 4px;
	color: #777;
}

.heading
{
	font-size: 1rem;
	font-weight: 200;
	color: #DDD;
}

/* ensure table cells don't wrap badly */
.v-simple-table td {
	white-space: nowrap;
}
</style>