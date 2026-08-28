<template>
  <section class="landing-section reveal">
    <div class="landing-eyebrow mono center">{{ index.key }}</div>
    <h2 class="landing-h2">
      {{ index.name }} <span class="idx-em">—</span> {{ index.fullName }}
    </h2>
    <p class="landing-lead">{{ index.description }}</p>

    <div class="idx-formula mono">{{ index.formula }}</div>

    <div class="cmp-wrap">
      <CompareSlider
        :before-src="index.beforeImage"
        :after-src="index.afterImage"
        :after-label="index.name"
      />
    </div>

    <div class="idx-scale">
      <div class="idx-scale-bar" :style="{ background: gradientCss }"></div>
      <div class="idx-scale-ticks mono">
        <span>−1</span><span>0</span><span>+1</span>
      </div>
      <div class="idx-scale-labels">
        <span>{{ index.scaleLow }}</span>
        <span>{{ index.scaleHigh }}</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from "vue";
import CompareSlider from "./CompareSlider.vue";

const props = defineProps({
  index: {
    type: Object,
    required: true,
  },
});

const gradientCss = computed(
  () => "linear-gradient(to right, " + props.index.gradient.join(", ") + ")",
);
</script>

<style scoped>
.landing-section {
  position: relative;
  max-width: 1080px;
  margin: 0 auto;
  padding: 90px 28px;
}
.reveal {
  opacity: 0;
  transform: translateY(28px);
  transition:
    opacity 0.8s var(--landing-ease),
    transform 0.8s var(--landing-ease);
}
.reveal.in {
  opacity: 1;
  transform: translateY(0);
}

.mono {
  font-family: var(--font-mono);
}

.landing-eyebrow {
  font-size: 11.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ripening-gold);
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  gap: 9px;
}
.landing-eyebrow.center {
  justify-content: center;
}
.landing-eyebrow::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--canopy-green);
  box-shadow: 0 0 0 3px rgba(107, 168, 95, 0.25);
  animation: landing-pulse 2.4s ease-in-out infinite;
}
@keyframes landing-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.landing-h2 {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.015em;
  font-size: clamp(26px, 4vw, 40px);
  max-width: 720px;
  margin: 0 auto 18px;
  line-height: 1.08;
  text-align: center;
  color: var(--husk-paper);
}
.idx-em {
  color: var(--ripening-gold);
}

.landing-lead {
  max-width: 560px;
  color: var(--husk-paper-dim);
  font-size: 15.5px;
  margin: 0 auto 34px;
  text-align: center;
}

.idx-formula {
  display: inline-block;
  font-size: 13px;
  letter-spacing: 0.03em;
  color: var(--ripening-gold);
  background: var(--canopy);
  border: 1px solid var(--line-on-dark);
  border-radius: 8px;
  padding: 10px 16px;
  margin: 0 auto 34px;
}

.cmp-wrap {
  margin: 0 auto 40px;
  max-width: 720px;
}

.idx-scale {
  max-width: 720px;
  margin: 34px auto 0;
}
.idx-scale-bar {
  height: 10px;
  border-radius: 999px;
  border: 1px solid var(--line-on-dark);
}
.idx-scale-ticks {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: var(--husk-paper-dim);
  margin-top: 8px;
}
.idx-scale-labels {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  margin-top: 10px;
  font-size: 12.5px;
  color: var(--husk-paper-dim);
}
.idx-scale-labels span:first-child {
  text-align: left;
}
.idx-scale-labels span:last-child {
  text-align: right;
}
</style>