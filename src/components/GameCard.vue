<template>
  <v-card rounded="lg" variant="outlined" class="game-card">
    <v-card-text class="pa-4">
      <!-- Teams Matchup -->
      <div class="d-flex align-center justify-space-between mb-4">
        <div class="team-section text-center flex-grow-1">
          <div class="text-h6 font-weight-bold">{{ game.awayTeam }}</div>
          <div class="text-caption text-medium-emphasis">Away</div>
        </div>

        <div class="vs-divider mx-4">
          <v-chip color="primary" variant="tonal" size="small">VS</v-chip>
        </div>

        <div class="team-section text-center flex-grow-1">
          <div class="text-h6 font-weight-bold">{{ game.homeTeam }}</div>
          <div class="text-caption text-medium-emphasis">Home</div>
        </div>
      </div>

      <v-divider class="mb-4" />

      <!-- Game Info -->
      <div class="game-info">
        <div class="d-flex align-center mb-2">
          <v-icon size="small" class="me-2" color="primary">mdi-calendar-clock</v-icon>
          <span class="text-body-2">{{ formattedGameDate }}</span>
        </div>

        <div v-if="game.venue" class="d-flex align-center mb-2">
          <v-icon size="small" class="me-2" color="primary">mdi-stadium</v-icon>
          <span class="text-body-2">{{ game.venue }}</span>
        </div>
      </div>

      <!-- Betting Lines -->
      <div class="betting-lines mt-4">
        <v-row dense>
          <v-col cols="6">
            <div class="line-card pa-3 rounded text-center">
              <div class="text-caption text-medium-emphasis mb-1">Spread</div>
              <div class="text-body-1 font-weight-bold">
                {{ formattedSpread }}
              </div>
            </div>
          </v-col>
          <v-col cols="6">
            <div class="line-card pa-3 rounded text-center">
              <div class="text-caption text-medium-emphasis mb-1">Over/Under</div>
              <div class="text-body-1 font-weight-bold">
                {{ formattedOverUnder }}
              </div>
            </div>
          </v-col>
        </v-row>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { Game } from '@/models'

const props = defineProps<{
  game: Game
}>()

const formattedGameDate = computed(() => {
  const date = new Date(props.game.gameDate)
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
})

const formattedSpread = computed(() => {
  if (props.game.spreadLine === null || props.game.spreadLine === undefined) {
    return 'TBD'
  }
  const spread = props.game.spreadLine
  if (spread > 0) {
    return `${props.game.homeTeam} +${spread}`
  } else if (spread < 0) {
    return `${props.game.homeTeam} ${spread}`
  }
  return 'EVEN'
})

const formattedOverUnder = computed(() => {
  if (props.game.overUnderLine === null || props.game.overUnderLine === undefined) {
    return 'TBD'
  }
  return `O/U ${props.game.overUnderLine}`
})
</script>

<style scoped lang="sass">
.game-card
  transition: box-shadow 0.2s ease-in-out
  &:hover
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15)

.team-section
  min-width: 100px

.vs-divider
  flex-shrink: 0

.line-card
  background: rgba(var(--v-theme-primary), 0.08)
</style>
