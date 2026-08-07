<template>
  <div
    id="help-overlay"
    class="help-overlay"
    v-show="state.helpVisible"
    @click.self="close"
  >
    <div class="help-modal onboarding" v-if="!showDetails">
      <div class="help-header">
        <h3>{{ visibleSlides[slide].title }}</h3>
        <button class="close-btn" @click="close">&times;</button>
      </div>
      <div class="help-slide">
        <transition name="slide-fade" mode="out-in">
          <div :key="slide" class="slide-content">
            <div class="slide-visual" aria-hidden="true">
              <i :class="visibleSlides[slide].icon"></i>
            </div>
            <p>{{ visibleSlides[slide].text }}</p>
            <ul v-if="visibleSlides[slide].points">
              <li v-for="(p, i) in visibleSlides[slide].points" :key="i" v-html="p"></li>
            </ul>
          </div>
        </transition>
      </div>
      <div class="help-footer">
        <div class="dot-nav" :aria-label="t('help.onboarding_step')">
          <button
            v-for="(s, i) in slides"
            :key="i"
            class="dot"
            :class="{ active: i === slide }"
            @click="slide = i"
            :aria-label="t('help.go_to_slide') + (i + 1)"
          ></button>
        </div>
        <div class="help-actions">
          <button class="link-btn" @click="showDetails = true">{{ t('help.detailed_guide') }}</button>
          <button class="ghost-btn" @click="close" v-if="slide < slides.length - 1">{{ t('help.skip') }}</button>
          <button class="primary-btn" @click="next">
            {{ slide < slides.length - 1 ? t('help.next') : t('help.got_it') }}
          </button>
        </div>
      </div>
    </div>

    <div class="help-modal" v-else>
      <div class="help-header">
        <h3>{{ t('help.how_title') }}</h3>
        <button class="close-btn" @click="close">&times;</button>
      </div>
      <div class="help-body">
        <h4>{{ t('help.what_indices') }}</h4>
        <p v-html="detail.indicesIntro"></p>
        <ul>
          <li><span style="color:#22c55e">{{ t('help.green') }}</span> &gt; 0.6 &mdash; {{ t('help.dense_healthy') }}</li>
          <li><span style="color:#eab308">{{ t('help.yellow') }}</span> 0.3&ndash;0.6 &mdash; {{ t('help.moderate_sparse') }}</li>
          <li><span style="color:#ef4444">{{ t('help.red') }}</span> &lt; 0.3 &mdash; {{ t('help.bare_stressed') }}</li>
        </ul>
        <p v-html="detail.indicesExtra"></p>

        <h4>{{ t('help.how_use') }}</h4>
        <ol>
          <li><strong>{{ t('help.use_sign_in') }}</strong> {{ t('help.use_sign_in_txt') }}</li>
          <li><strong>{{ t('help.use_slider') }}</strong> {{ t('help.use_slider_txt') }}</li>
          <li><strong>{{ t('help.use_basemap') }}</strong> {{ t('help.use_basemap_txt') }}</li>
          <li><strong>{{ t('help.use_search') }}</strong> {{ t('help.use_search_txt') }}</li>
          <li><strong>{{ t('help.use_area') }}</strong> {{ t('help.use_area_txt') }}</li>
          <li><strong>{{ t('help.use_click') }}</strong> {{ t('help.use_click_txt') }}</li>
          <li><strong>{{ t('help.use_draw') }}</strong> {{ t('help.use_draw_txt') }}</li>
          <li><strong>{{ t('help.use_dashboard') }}</strong> {{ t('help.use_dashboard_txt') }}</li>
          <li><strong>{{ t('help.use_compare') }}</strong> {{ t('help.use_compare_txt') }}</li>
          <li><strong>{{ t('help.use_export') }}</strong> {{ t('help.use_export_txt') }}</li>
        </ol>

        <h4>{{ t('help.areas_interest') }}</h4>
        <p v-html="detail.areasIntro"></p>
        <ul>
          <li><strong>{{ t('help.areas_switch') }}</strong> {{ t('help.areas_switch_txt') }}</li>
          <li><strong>{{ t('help.areas_add') }}</strong> {{ t('help.areas_add_txt') }}</li>
          <li><strong>{{ t('help.areas_delete') }}</strong> {{ t('help.areas_delete_txt') }}</li>
          <li><strong>{{ t('help.areas_sync') }}</strong> {{ t('help.areas_sync_txt') }}</li>
        </ul>

        <h4>{{ t('help.growth_stages') }}</h4>
        <p>{{ t('help.stages_intro') }}</p>
        <ul>
          <li><strong>{{ t('field.stage_germination') }}</strong> ({{ t('help.days') }} 1&ndash;10) &mdash; {{ t('help.stage_germ_txt') }}</li>
          <li><strong>{{ t('field.stage_seedling') }}</strong> ({{ t('help.days') }} 11&ndash;25) &mdash; {{ t('help.stage_seed_txt') }}</li>
          <li><strong>{{ t('field.stage_vegetative') }}</strong> ({{ t('help.days') }} 26&ndash;55) &mdash; {{ t('help.stage_veg_txt') }}</li>
          <li><strong>{{ t('field.stage_reproductive') }}</strong> ({{ t('help.days') }} 56&ndash;90) &mdash; {{ t('help.stage_repro_txt') }}</li>
          <li><strong>{{ t('field.stage_maturation') }}</strong> ({{ t('help.days') }} 91&ndash;110) &mdash; {{ t('help.stage_mat_txt') }}</li>
          <li><strong>{{ t('field.stage_harvest') }}</strong> ({{ t('help.days') }} 111+) &mdash; {{ t('help.stage_harv_txt') }}</li>
        </ul>

        <h4>{{ t('help.data_source') }}</h4>
        <p v-html="detail.dataSource"></p>

        <div class="help-actions details-actions">
          <button class="ghost-btn" @click="showDetails = false">{{ t('help.back_to_tour') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { state } from '../store'
import { useI18n } from '../i18n'

const { t } = useI18n()
const slide = ref(0)
const showDetails = ref(false)

const slides = [
  {
    title: 'What is NDVI?',
    titleKm: 'អ្វីទៅជា NDVI?',
    icon: 'ti ti-plant',
    text: 'NDVI (Normalized Difference Vegetation Index) is a satellite measurement of plant health. It compares near-infrared and red light reflected by the crop to estimate how much green, healthy vegetation is present.',
    textKm: 'NDVI គឺជាការវាស់ស្ទង់សុខភាពដំណាំតាមផ្កាយរណប។ វាប្រៀបធៀបពន្លឺជិត-អ៊ីនហ្វ្រារ៉េដ និងពន្លឺក្រហមដែលឆ្លុះបញ្ចាំងដោយដំណាំ ដើម្បីប៉ាន់ស្មានថាមានរុក្ខជាតិបៃតងល្អប៉ុន្មាន។',
    points: [
      'Values run from <strong>-1 to 1</strong> &mdash; higher means healthier, denser vegetation',
      'Computed from <strong>Sentinel-2</strong> satellite imagery on Google Earth Engine',
      'You can also inspect <strong>NDWI</strong> (surface water) and <strong>LSWI</strong> (canopy/soil moisture)',
    ],
    pointsKm: [
      'តម្លៃចាប់ពី <strong>-1 ដល់ 1</strong> — ខ្ពស់ជាងមានន័យថាដំណាំល្អ និងក្រាស់ជាង',
      'គណនាពីរូបភាពផ្កាយរណប <strong>Sentinel-2</strong> លើ Google Earth Engine',
      'អ្នកក៏អាចពិនិត្យ <strong>NDWI</strong> (ទឹកលើផ្ទៃ) និង <strong>LSWI</strong> (សំណើមសំបក/ដី)',
    ],
  },
  {
    title: 'Reading the color scale',
    titleKm: 'អានក្រមពណ៌',
    icon: 'ti ti-adjustments-horizontal',
    text: 'The map is colored by vegetation health. The legend in the bottom-right shows how color maps to NDVI &mdash; green means healthy crop, yellow means moderate or thinning vegetation, red means bare soil, water, or stressed crops.',
    textKm: 'ផែនទីពណ៌តាមសុខភាពដំណាំ។ រឿងគន្លឹះនៅកណ្តាលខាងក្រោមបង្ហាញពីទំនាក់ទំនងពណ៌ទៅ NDVI — បៃតងជាដំណាំល្អ លឿងជារុក្ខជាតិល្មម ឬស្តើង ក្រហមជាដីទទេ ទឹក ឬដំណាំប៉ះពាល់។',
    points: [
      '<span style="color:#22c55e;font-weight:700">Green</span> &gt; 0.6 &mdash; dense, healthy vegetation',
      '<span style="color:#eab308;font-weight:700">Yellow</span> 0.3&ndash;0.6 &mdash; moderate or sparse vegetation',
      '<span style="color:#ef4444;font-weight:700">Red</span> &lt; 0.3 &mdash; bare soil, water, or stressed crops',
    ],
    pointsKm: [
      '<span style="color:#22c55e;font-weight:700">បៃតង</span> &gt; 0.6 — រដំណាំក្រាស់ល្អ',
      '<span style="color:#eab308;font-weight:700">លឿង</span> 0.3&ndash;0.6 — រុក្ខជាតិល្មម ឬស្តើង',
      '<span style="color:#ef4444;font-weight:700">ក្រហម</span> &lt; 0.3 — ដីទទេ ទឹក ឬដំណាំប៉ះពាល់',
    ],
  },
  {
    title: 'How stress alerts work',
    titleKm: 'របៀបដំណឹងស្ត្រេសដំណើរការ',
    icon: 'ti ti-alert-triangle',
    text: 'Saved fields get a live health badge. If you set a planting date, the app compares current NDVI to expected ranges for the crop&rsquo;s growth stage &mdash; early-season low NDVI is normal, so stage-aware thresholds reduce false alarms.',
    textKm: 'វាលដែលរក្សាទុកមានសញ្ញាសុខភាពផ្ទាល់។ បើអ្នកកំណត់កាលបរិច្ឆេទដាំ កម្មវិធីប្រៀបធៀប NDVI បច្ចុប្បន្ននឹងជួរ៍ដែលរំពឹងសម្រាប់ដំណាក់កាលលូតសាសន៍ែ— NDVI ទាបដើមរដូវជារឿង ជួបនឹងដែនកំណត់តាមដំណាក់កាលជួយកាត់បន្ថយការជូនដំណឹងខុស។',
    points: [
      '<span style="color:#22c98e;font-weight:700">Healthy</span> &mdash; NDVI within the expected range',
      '<span style="color:#f5a623;font-weight:700">Below expected</span> &mdash; lagging behind the stage curve',
      '<span style="color:#ef5b5b;font-weight:700">Stressed</span> &mdash; a genuine drop; rainfall context is added',
    ],
    pointsKm: [
      '<span style="color:#22c98e;font-weight:700">ល្អ</span> — NDVI ស្ថិតក្នុងជួររំពឹង',
      '<span style="color:#f5a623;font-weight:700">ទាបជាងរំពឹង</span> — យឺត ជាងខ្សែកោងដំណាក់កាល',
      '<span style="color:#ef5b5b;font-weight:700">ស្ត្រេស</span> — ការធ្លាក់ចុះពិតប្រាកដ; បន្ថែមបរិបទទឹកភ្លៀង',
    ],
  },
  {
    title: 'Time slider & compare',
    titleKm: 'រំកិលពេលវេលា និង ប្រៀបធៀប',
    icon: 'ti ti-clock-play',
    text: 'Drag the time slider to watch crop health change month by month. Press play to auto-advance through a season. Toggle Compare to view two months side-by-side with independent sliders.',
    textKm: 'អូសរំកិលពេលវេលា ដើម្បីមើលការផ្លាស់ប្តូរសុខភាពដំណាំរៀងរាលខែ។ ចុច play ដើម្បីបន្តដំណើរការដោយស្វ័យប្រវត្តិ។ ចុច Compare ដើម្បីមើលពីរខែផ្ទឹមគ្នាជារ៉ូមែរែដោយឡម្ក',
    points: [
      'The <strong>scene-count pill</strong> shows how many cloud-free images back each month',
      'Flood and dry-spell markers sit on the slider as colored bands',
      '<strong>Click the map</strong> to inspect a spot&rsquo;s trend chart, or draw &amp; save fields to track them',
    ],
    pointsKm: [
      'រូបសញ្ញា <strong>រាប់រូបភាព</strong> បង្ហាញចំនួនរូបភាពគ្មានពពស ដែលគាំទ្រខែនីមួយ',
      'សញ្ញាទឹកជំនន់ និងគ្រោះរាំងស្ងួំ សម្គាល់លើរំកិលជាពណ៌',
      '<strong>ចុចលើផែនទី</strong> ដើម្បីពិនិត្យក្រាហ្វិកសេីរភាព រឺគូរ&amp;រក្សាវាលដើម្បីតាមដាន',
    ],
  },
]

const langs = computed(() => (state.preferredLanguage === 'km' ? 'Km' : ''))
const visibleSlides = computed(() => slides.map((s) => ({
  title: langs.value ? s.titleKm : s.title,
  icon: s.icon,
  text: langs.value ? s.textKm : s.text,
  points: langs.value ? (s.pointsKm || null) : s.points,
})))

const detail = {
  indicesIntro: null,
  indicesExtra: null,
  areasIntro: null,
  dataSource: null,
}
const detailMap = {
  en: {
    indicesIntro: '<strong>NDVI</strong> (Normalized Difference Vegetation Index) measures plant health using near-infrared and red bands. Values range from <strong>-1 to 1</strong>:',
    indicesExtra: '<strong>NDWI</strong> detects surface water (green &amp; NIR bands). <strong>LSWI</strong> (Land Surface Water Index, NIR &amp; SWIR) is more sensitive to moisture in canopy and soil &mdash; useful for spotting transplanting and flooded paddies. Toggle between all three with the segmented buttons in the bottom panel.',
    areasIntro: 'An <strong>area</strong> is a bounding box that defines where the satellite analysis runs. The active area is shown as a red dashed rectangle on the map.',
    dataSource: 'Satellite imagery from <strong>Sentinel-2</strong> (ESA), processed by <strong>Google Earth Engine</strong>. Rainfall data from <strong>CHIRPS</strong> (UCSB/USGS). Area of interest: cement factory region (Battambang, Cambodia).',
  },
  km: {
    indicesIntro: '<strong>NDVI</strong> (សន្ទស្សន៍ភាពខុសគ្នានៃរុក្ខជាតិ) វាស់សុខភាពដំណាំដោយប្រើក្រុមពន្លឺជិត-អ៊ីនហ្វ្រារ៉េដ និងក្រហម។ តម្លៃចាប់ពី <strong>-1 ដល់ 1</strong>:',
    indicesExtra: '<strong>NDWI</strong> រកឃើញទឹកលើផ្ទៃ (ក្រុមពន្លឺបៃតង &amp; NIR)។ <strong>LSWI</strong> (សន្ទស្សន៍ទឹកលើផ្ទៃដី, NIR &amp; SWIR) មានភាពរសើបជាងចំពោះសំណើមក្នុងសំបកដំណាំ និងដី &mdash; មានប្រយោជន៍សម្រាប់រកការស្ទូង និងស្រែជន់លិច។ ប្ដូររវាងទាំងបីតាមប៊ូតុងនៅផ្នែកខាងក្រោម។',
    areasIntro: 'តំបន់មួយជាប្រអប់ព្រំដែនដែលកំណត់កន្លែងដំណើរការវិភាគផ្កាយរណប។ តំបន់សកម្មត្រូវបានបង្ហាញជាចតុកោណខូចខាតពណ៌ក្រហមលើផែនទី។',
    dataSource: 'រូបភាពផ្កាយរណបពី <strong>Sentinel-2</strong> (ESA) ដំណើរការដោយ <strong>Google Earth Engine</strong>។ ទិន្នន័យទឹកភ្លៀងពី <strong>CHIRPS</strong> (UCSB/USGS)។ តំបន់សិក្សា៖ តំបន់រោងចក្រស៊ីម៉ងត៍ (បាត់ដំបង កម្ពុជា)។',
  },
}
watch(() => state.preferredLanguage, () => {
  const d = detailMap[state.preferredLanguage === 'km' ? 'km' : 'en']
  detail.indicesIntro = d.indicesIntro
  detail.indicesExtra = d.indicesExtra
  detail.areasIntro = d.areasIntro
  detail.dataSource = d.dataSource
}, { immediate: true })

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
