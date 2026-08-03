<template>
  <div
    id="help-overlay"
    class="help-overlay"
    v-show="state.helpVisible"
    @click.self="close"
  >
    <div class="help-modal onboarding" v-if="!showDetails">
      <div class="help-header">
        <h3>{{ slides[slide].title }}</h3>
        <button class="close-btn" @click="close">&times;</button>
      </div>
      <div class="help-slide">
        <transition name="slide-fade" mode="out-in">
          <div :key="slide" class="slide-content">
            <div class="slide-visual" aria-hidden="true">
              <i :class="slides[slide].icon"></i>
            </div>
            <p>{{ slides[slide].text }}</p>
            <ul v-if="slides[slide].points">
              <li v-for="(p, i) in slides[slide].points" :key="i" v-html="p"></li>
            </ul>
          </div>
        </transition>
      </div>
      <div class="help-footer">
        <div class="dot-nav" aria-label="Onboarding step">
          <button
            v-for="(s, i) in slides"
            :key="i"
            class="dot"
            :class="{ active: i === slide }"
            @click="slide = i"
            :aria-label="'Go to slide ' + (i + 1)"
          ></button>
        </div>
        <div class="help-actions">
          <button class="link-btn" @click="showDetails = true">Detailed guide</button>
          <button class="ghost-btn" @click="close" v-if="slide < slides.length - 1">Skip</button>
          <button class="primary-btn" @click="next">
            {{ slide < slides.length - 1 ? 'Next' : 'Got it' }}
          </button>
        </div>
      </div>
    </div>

    <div class="help-modal" v-else>
      <div class="help-header">
        <h3>How This Works</h3>
        <button class="close-btn" @click="close">&times;</button>
      </div>
      <div class="help-body">
        <h4>What are the indices?</h4>
        <p><strong>NDVI</strong> (Normalized Difference Vegetation Index) measures plant health using near-infrared and red bands. Values range from <strong>-1 to 1</strong>:</p>
        <ul>
          <li><span style="color:#22c55e">Green</span> &gt; 0.6 &mdash; Dense, healthy vegetation</li>
          <li><span style="color:#eab308">Yellow</span> 0.3&ndash;0.6 &mdash; Moderate or sparse vegetation</li>
          <li><span style="color:#ef4444">Red</span> &lt; 0.3 &mdash; Bare soil, water, or stressed crops</li>
        </ul>
        <p><strong>NDWI</strong> detects surface water (green &amp; NIR bands). <strong>LSWI</strong> (Land Surface Water Index, NIR &amp; SWIR) is more sensitive to moisture in canopy and soil &mdash; useful for spotting transplanting and flooded paddies. Toggle between all three with the segmented buttons in the bottom panel.</p>

        <h4>How to use this app</h4>
        <ol>
          <li><strong>Sign in</strong> &mdash; Click "Sign in with Google" to authenticate with Earth Engine.</li>
          <li><strong>Drag the slider</strong> &mdash; Move the time slider at the bottom to see NDVI/NDWI/LSWI change month by month. A scene count next to the month label shows how many cloud-free Sentinel-2 images went into that month's composite (amber dot means 1&ndash;2 scenes &mdash; lower confidence). Click <strong>&#8635;</strong> to jump to the most recent complete month.</li>
          <li><strong>Toggle basemap</strong> &mdash; Switch between Street (OSM) and Satellite (Esri World Imagery) with the button in the slider panel.</li>
          <li><strong>Search places</strong> &mdash; Type a location name in the search bar and press Enter or click Go to fly to it.</li>
          <li><strong>Choose an area</strong> &mdash; The "Areas" dropdown in the bottom panel switches between your saved areas of interest (the box Earth Engine analyzes). Use the map icon next to it to create a new one. See "Areas of interest" below.</li>
          <li><strong>Click anywhere</strong> on the map to see a detailed trend chart, stress alerts, and recent rainfall context.</li>
          <li><strong>Draw a field</strong> &mdash; Use the polygon/rectangle tools to outline a rice paddy, then name it and optionally set a planting date.</li>
          <li><strong>Check the dashboard</strong> &mdash; Click &#9776; to see your saved fields with live health status, growth stage, and area. Click an active field card to deselect it and return to the AOI-wide view.</li>
          <li><strong>Compare months</strong> &mdash; Toggle "Compare" to view two months side-by-side with synced maps.</li>
          <li><strong>Export</strong> &mdash; Click "Export" to download the trend chart as PNG or a full PDF report with chart, field info, and health summary.</li>
        </ol>

        <h4>Areas of interest</h4>
        <p>An <strong>area</strong> is a bounding box that defines where the satellite analysis runs. The active area is shown as a red dashed rectangle on the map.</p>
        <ul>
          <li><strong>Switch areas</strong> &mdash; Open the "Areas" dropdown in the bottom panel and pick one. The map recenters and NDVI/NDWI/LSWI are recomputed for that box.</li>
          <li><strong>Add an area</strong> &mdash; Click the map icon (or "+ New area") to open the New Area window. Two ways to set the box: type the West/South/East/North coordinates directly, or <strong>search a place name</strong> and the box is filled automatically from the matched location.</li>
          <li><strong>Delete an area</strong> &mdash; Hover a saved area in the dropdown and click the trash icon.</li>
          <li><strong>Synced to your account</strong> &mdash; Areas are saved to your account (up to <strong>5</strong> per user), so they follow you across devices. The first time you sign in, a default "Battambang (default)" area is created automatically.</li>
        </ul>

        <h4>Growth stages</h4>
        <p>If you set a planting date for a field, the app compares the current NDVI against expected ranges for each rice growth stage:</p>
        <ul>
          <li><strong>Germination</strong> (Days 1&ndash;10) &mdash; Bare soil / shallow water: NDVI 0.05&ndash;0.15</li>
          <li><strong>Seedling</strong> (Days 11&ndash;25) &mdash; Sparse green: NDVI 0.15&ndash;0.30</li>
          <li><strong>Vegetative</strong> (Days 26&ndash;55) &mdash; Rapid growth: NDVI 0.30&ndash;0.55</li>
          <li><strong>Reproductive</strong> (Days 56&ndash;90) &mdash; Peak biomass: NDVI 0.55&ndash;0.75</li>
          <li><strong>Maturation</strong> (Days 91&ndash;110) &mdash; Senescing: NDVI 0.35&ndash;0.55</li>
          <li><strong>Harvest</strong> (Days 111+) &mdash; Dry-down: NDVI 0.10&ndash;0.30</li>
        </ul>

        <h4>Data source</h4>
        <p>Satellite imagery from <strong>Sentinel-2</strong> (ESA), processed by <strong>Google Earth Engine</strong>. Rainfall data from <strong>CHIRPS</strong> (UCSB/USGS). Area of interest: cement factory region (Battambang, Cambodia).</p>

        <div class="help-actions details-actions">
          <button class="ghost-btn" @click="showDetails = false">Back to tour</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { state } from '../store'

const slide = ref(0)
const showDetails = ref(false)

const slides = [
  {
    title: 'What is NDVI?',
    icon: 'ti ti-plant',
    text: 'NDVI (Normalized Difference Vegetation Index) is a satellite measurement of plant health. It compares near-infrared and red light reflected by the crop to estimate how much green, healthy vegetation is present.',
    points: [
      'Values run from <strong>-1 to 1</strong> &mdash; higher means healthier, denser vegetation',
      'Computed from <strong>Sentinel-2</strong> satellite imagery on Google Earth Engine',
      'You can also inspect <strong>NDWI</strong> (surface water) and <strong>LSWI</strong> (canopy/soil moisture)',
    ],
  },
  {
    title: 'Reading the color scale',
    icon: 'ti ti-adjustments-horizontal',
    text: 'The map is colored by vegetation health. The legend in the bottom-right shows how color maps to NDVI &mdash; green means healthy crop, yellow means moderate or thinning vegetation, red means bare soil, water, or stressed crops.',
    points: [
      '<span style="color:#22c55e;font-weight:700">Green</span> &gt; 0.6 &mdash; dense, healthy vegetation',
      '<span style="color:#eab308;font-weight:700">Yellow</span> 0.3&ndash;0.6 &mdash; moderate or sparse vegetation',
      '<span style="color:#ef4444;font-weight:700">Red</span> &lt; 0.3 &mdash; bare soil, water, or stressed crops',
    ],
  },
  {
    title: 'How stress alerts work',
    icon: 'ti ti-alert-triangle',
    text: 'Saved fields get a live health badge. If you set a planting date, the app compares current NDVI to expected ranges for the crop&rsquo;s growth stage &mdash; early-season low NDVI is normal, so stage-aware thresholds reduce false alarms.',
    points: [
      '<span style="color:#22c98e;font-weight:700">Healthy</span> &mdash; NDVI within the expected range',
      '<span style="color:#f5a623;font-weight:700">Below expected</span> &mdash; lagging behind the stage curve',
      '<span style="color:#ef5b5b;font-weight:700">Stressed</span> &mdash; a genuine drop; rainfall context is added',
    ],
  },
  {
    title: 'Time slider & compare',
    icon: 'ti ti-clock-play',
    text: 'Drag the time slider to watch crop health change month by month. Press play to auto-advance through a season. Toggle Compare to view two months side-by-side with independent sliders.',
    points: [
      'The <strong>scene-count pill</strong> shows how many cloud-free images back each month',
      'Flood and dry-spell markers sit on the slider as colored bands',
      '<strong>Click the map</strong> to inspect a spot&rsquo;s trend chart, or draw &amp; save fields to track them',
    ],
  },
]

function next() {
  if (slide.value < slides.length - 1) slide.value++
  else close()
}

function close() {
  state.helpVisible = false
}

watch(() => state.helpVisible, (open) => {
  if (open) {
    slide.value = 0
    showDetails.value = false
  }
})
</script>
