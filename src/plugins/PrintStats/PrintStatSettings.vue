<template>
	<v-simple-table>
		<template #default>
			<!--<thead>
				<tr>
					<th class="text-left">
						Setting
					</th>
				</tr>
			</thead>-->
			<tbody>
				<tr >
					<td>
						<v-text-field
            
            
            label="Logfile Name"
          ></v-text-field>
					</td>
					
				</tr>
			</tbody>
		</template>
	</v-simple-table>
</template>

<script>
'use strict'

import { mapState } from 'vuex'

export default {
	computed: {
		...mapState('machine/model', {
			axes: state => state.move.axes,
			endstops: state => state.sensors.endstops
		}),
		endstopItems() {
			return this.endstops.map((endstop, index) => ({
				axis: (index < this.axes.length) ? this.axes[index].letter : 'n/a',
				...endstop
			}), this);
		}
	}
}
</script>