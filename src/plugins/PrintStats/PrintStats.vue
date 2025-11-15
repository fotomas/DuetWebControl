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
					<!-- time range selector: controls parsing cutoff -->
					<v-select
						v-model="timeRange"
						:items="timeRangeOptions"
						label="Range"
						style="max-width:160px;"
						dense
						hide-details
					/>
 					<v-select
 						v-model="selectedFile"
 						:items="files"
 						label="Log file"
 						style="max-width:300px;"
 						dense
 						hide-details
 					/>
 					<v-btn color="success" @click="loadStats">
 						<v-icon left>mdi-refresh</v-icon>
 						Load
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
					<td class="ps-label">Finished prints</td>
					<td class="ps-value">{{ noOfCancelledPrints }}</td>
					<td class="ps-label">Cancelled prints</td>
				</tr>
				<tr>
					<td class="ps-value">{{ longestRunPeriodTimeFormatted }}</td>
					<td class="ps-label">{{ longestRunLabel }} ({{ longestRunPeriodLabel }})</td>
					<td class="ps-value">{{ busiestWeekCount }} </td>
					<td class="ps-label">{{ busiestLabel }}, ({{ busiestWeek }})</td>
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
		},
		longestRunPeriodTimeFormatted() {
			return this.formatMinutesToHoursMinutes(this.longestRunPeriodMinutes);
		},
		// true when grouping is by day (Past month / Past week)
		isGroupByDay() {
			const r = (this.timeRange || '').toLowerCase();
			return r.includes('month') || r.includes('week');
		},
		// dynamic labels depending on grouping
		busiestLabel() {
			return this.isGroupByDay ? 'Most prints in a day' : 'Most prints in a week';
		},
		longestRunLabel() {
			return this.isGroupByDay ? 'Most print time in a day' : 'Most print time in a week';
		}
	},
	data(){
		return{
			files: [],
			selectedFile: '',
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
			longestRunPeriodLabel: '—',
			longestRunPeriodMinutes: 0,
 			busiestWeek: '',
 			busiestWeekCount: 0,
 			avgPrintTimeMinutes: 0,
 			longestPrintTimeMinutes: 0,
			// Chart.js instance
			chartInstance: null,
			ratioChartInstance: null,
			// time range selector for parsing
			timeRange: 'Past month',
			timeRangeOptions: ['All time', 'Past year', 'Past month', 'Past week'],
			// parsed events cached in memory (lightweight objects), reused when timeRange changes
			parsedEvents: [], // { date: Date, dateStr: 'YYYY-MM-DD', finished: bool, cancelled: bool, printMinutes: number|null }
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
				const files = await this.getFileList(this.systemDirectory);
				this.files = files
					.filter(file => !file.isDirectory && (file.name.endsWith('.txt') || file.name.endsWith('.log')))
					.map(file => file.name)
					.sort();
				if (this.files.length > 0) {
					this.selectedFile = this.files[0];
				}
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

 				if (this.selectedFile) {
 					const stats = await this.download({
 						filename: this.combinePaths(this.systemDirectory, this.selectedFile),
 						type: 'text',
 						showProgress: true,
 						showSuccess: false,
 						showError: true,
 					});
+					this.showStats(stats);
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
			// omit hours if zero
			if (h === 0) return `${m}m`;
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
		// return a Date cutoff (UTC midnight) for the given range, or null for 'All time'
		getCutoffDate(range) {
			if (!range) return null;
			const r = String(range).toLowerCase();
			if (r === 'all time' || r === 'all') return null;
			const now = new Date();
			// use UTC midnight for comparisons
			const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
			if (r.includes('year')) {
				cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
				return cutoff;
			}
			if (r.includes('month')) {
				cutoff.setUTCMonth(cutoff.getUTCMonth() - 1);
				return cutoff;
			}
			if (r.includes('week')) {
				cutoff.setUTCDate(cutoff.getUTCDate() - 7);
				return cutoff;
			}
			return null;
		},
		// parse file contents into lightweight event objects and cache them
		showStats(stats) {
			const text = typeof stats === 'string'
				? stats
				: (stats && (stats.data || stats.text)) ? (stats.data || stats.text) : String(stats);

			const lines = (text || '').split(/\r?\n/);
			// match an ISO date (YYYY-MM-DD) optionally followed by a time (HH:MM:SS)
			// anywhere in the line. This handles both _eventlog (date at line start)
			// and print_log (many "power up" blocks and lines without a date).
			const tsRe = /(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/;
			const events = [];
			let lastSeenDateStr = null;
			for (const rawLine of lines) {
				if (!rawLine) continue;
				const line = rawLine.trim();
				// explicitly ignore "power up" lines entirely
				if (/^power up\b/i.test(line)) continue;
				const m = tsRe.exec(line);
				// if no date found in this line, try to reuse the last seen date
				if (!m && !lastSeenDateStr) continue;
				const dateStr = m ? m[1] : lastSeenDateStr;
				const timeStr = (m && m[2]) ? m[2] : '00:00:00';
				if (dateStr) lastSeenDateStr = dateStr;
				const lc = line.toLowerCase();
				if (!lc.includes('[warn]')) continue;
				const isFinished = lc.includes('finished');
				const isCancelled = lc.includes('cancelled') || lc.includes('canceled');
				if (!isFinished && !isCancelled) continue;
				// build full timestamp (UTC)
				const d = new Date(dateStr + 'T' + timeStr + 'Z');
				if (Number.isNaN(d.getTime())) continue;
				const printMin = this.extractPrintTimeMinutes(line);
				events.push({
					date: d,
					dateStr,
					finished: !!isFinished,
					cancelled: !!isCancelled,
					printMinutes: printMin
				});
			}
			// cache parsed events (lightweight) and process according to current timeRange
			this.parsedEvents = events;
			this.processEvents();
		},

		// process the cached parsedEvents according to current timeRange and grouping
		processEvents() {
			const cutoff = this.getCutoffDate(this.timeRange);
			const rangeLower = (this.timeRange || '').toLowerCase();
			const groupByDay = (rangeLower.includes('month') || rangeLower.includes('week'));

			const finishedMap = Object.create(null);
			const cancelledMap = Object.create(null);
			const printTimePerPeriodMap = Object.create(null);
			let totalFinished = 0;
			let totalCancelled = 0;
			const printTimes = [];
 			const now = new Date();
 			const oneYearAgo = new Date(now);
 			oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
 
 			for (const ev of this.parsedEvents || []) {
 				if (!ev || !ev.date) continue;
 				if (cutoff && ev.date < cutoff) continue;
 				const periodKey = groupByDay ? ev.dateStr : this.isoWeekKeyFromDate(ev.date);
 				if (ev.finished) {
 					finishedMap[periodKey] = (finishedMap[periodKey] || 0) + 1;
 					totalFinished++;
 					if (ev.printMinutes != null) {
 						// include finished print times in per-period runtime totals
 						printTimes.push(ev.printMinutes);
						printTimePerPeriodMap[periodKey] = (printTimePerPeriodMap[periodKey] || 0) + ev.printMinutes;
 					}
 				}
 				if (ev.cancelled) {
 					cancelledMap[periodKey] = (cancelledMap[periodKey] || 0) + 1;
 					totalCancelled++;
					// include cancelled print times in per-period runtime totals as well
					if (ev.printMinutes != null) {
						printTimePerPeriodMap[periodKey] = (printTimePerPeriodMap[periodKey] || 0) + ev.printMinutes;
					}
 				}
 			}

			const keys = Array.from(new Set(Object.keys(finishedMap).concat(Object.keys(cancelledMap))));
			keys.sort();

			if (groupByDay) {
				this.weeklyLabels = keys.slice();
			} else {
				this.weeklyLabels = keys.map(k => this.weekLabelFromKey(k));
			}

			this.finishedPerWeek = keys.map(k => finishedMap[k] || 0);
			this.cancelledPerWeek = keys.map(k => cancelledMap[k] || 0);
			this.totalPrintTimePerWeek = keys.map(k => (printTimePerPeriodMap[k] || 0) / 60);
			this.noOfFinishedPrints = totalFinished;
			this.noOfCancelledPrints = totalCancelled;
 
 			let maxCount = 0, busiestKey = '';
 			for (const k of keys) {
 				const c = (finishedMap[k] || 0) + (cancelledMap[k] || 0);
 				if (c > maxCount) { maxCount = c; busiestKey = k; }
 			}
 			this.busiestWeekCount = maxCount;
 			this.busiestWeek = groupByDay ? (busiestKey || '—') : (busiestKey ? this.weekLabelFromKey(busiestKey) : '—');

			// longest run period: find period with highest total run minutes (sum of printMinutes per period)
			let maxRun = 0, maxRunKey = '';
			for (const k of keys) {
				const totalMin = (printTimePerPeriodMap[k] || 0);
				if (totalMin > maxRun) { maxRun = totalMin; maxRunKey = k; }
			}
			this.longestRunPeriodMinutes = Math.round(maxRun); // minutes
			this.longestRunPeriodLabel = groupByDay ? (maxRunKey || '—') : (maxRunKey ? this.weekLabelFromKey(maxRunKey) : '—');

			if (printTimes.length > 0) {
				this.longestPrintTimeMinutes = Math.max(...printTimes);
				this.avgPrintTimeMinutes = printTimes.reduce((a,b) => a+b, 0) / printTimes.length;
			} else {
				this.longestPrintTimeMinutes = 0;
				this.avgPrintTimeMinutes = 0;
			}

			this.$nextTick(()=>{ this.renderRatioChart(); this.renderChart(); });
			this.$emit('show-stats', { noOfFinishedPrints: totalFinished, noOfCancelledPrints: totalCancelled, weekly: { labels: this.weeklyLabels, finished: this.finishedPerWeek, cancelled: this.cancelledPerWeek }, groupBy: groupByDay ? 'day' : 'week' });
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

			// capture timeRange for use in callback (this context is lost in Chart.js callback)
			const currentTimeRange = this.timeRange;

			// formatting helper available inside Chart callbacks
			const formatMinutes = (minutes) => {
				// delegate to component formatter
				try { return this.formatMinutesToHoursMinutes(minutes); } catch (e) { return String(minutes) + 'm'; }
			};

 			const data = {
 				labels: this.weeklyLabels,
 				datasets: [
 					{
 						label: 'Finished',
 						data: this.finishedPerWeek,
 						borderColor: '#2c7be5',
 						backgroundColor: 'rgba(44,123,229,0.08)',
 						fill: false,
 						lineTension: 0.1,
 					},
 					{
 					 label: 'Cancelled',
 					 data: this.cancelledPerWeek,
 					 borderColor: '#e74c3c',
 					 backgroundColor: 'rgba(231,76,60,0.08)',
 					 fill: false,
 					 lineTension: 0.1,
 					},
 					{
 						label: 'Print time',
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
							// detect print-time dataset by label (case-insensitive match)
							if (/print time/i.test(label)) {
								// tooltipItem.yLabel is in hours (may be fractional) — convert to minutes and format
								const minutes = Math.round((tooltipItem.yLabel || 0) * 60);
								return label + ': ' + formatMinutes(minutes);
							}
							// default formatting for other datasets — show raw value
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
 								// format based on grouping: week => YY-MM, day => YY-MM-DD
 								if (!value) return value;
								const rangeLower = (currentTimeRange || '').toLowerCase();
 								const groupByDay = (rangeLower.includes('month') || rangeLower.includes('week'));
 								if (groupByDay) {
 									// day format YYYY-MM-DD -> YY-MM-DD (last 8 chars)
 									if (value.length >= 8) return value.slice(2, 10); // "YY-MM-DD"
 								} else {
 									// week format: already YYYY-MM-DD (Monday) -> YY-MM
 									if (value.length >= 5) return value.slice(2, 7); // "YY-MM"
 								}
 								return value;
 							}
 						}
 					}],
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
	watch: {
		timeRange() {
			// reprocess using cached parsedEvents only
			if (this.parsedEvents && this.parsedEvents.length) this.processEvents();
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
	padding: 6px 8px 6px 8px;
	color: #DDD;
	padding-top: 0%;
	padding-bottom: 0%;
	padding-right: 4px;
}

/* labels: smaller, left-aligned, bottom-aligned */
.ps-label {
	font-size: 0.85rem; /* smaller */
	text-align: left;
	vertical-align: middle;
	padding: 6px 4px;
	color: #777;

	/* limit label column width and allow wrapping to multiple lines */
	max-width: 80px;
	white-space: normal;
	word-break: break-word;
}

/* ensure table cells don't wrap badly */
.v-simple-table td {
	white-space: nowrap;
}
</style>