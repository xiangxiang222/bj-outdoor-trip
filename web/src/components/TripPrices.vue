<template>
  <div class="trip-prices" :class="{ compact }">
    <span v-if="showOrigin" class="tp-item">
      <em>原价</em>
      <s v-if="deal">¥{{ origin }}</s>
      <b v-else>¥{{ origin }}</b>
    </span>
    <span v-if="deal" class="tp-item">
      <em>现价</em>
      <b>¥{{ trip }}</b>
    </span>
    <span class="tp-item">
      <em>会员</em>
      <b>¥{{ member }}</b>
    </span>
    <span class="tp-item">
      <em>学生</em>
      <b>¥{{ student }}</b>
    </span>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  quote: { type: Object, default: () => ({}) },
  origin: { type: Number, default: 0 },
  memberPrice: { type: Number, default: 0 },
  studentPrice: { type: Number, default: 0 },
  tripPrice: { type: Number, default: 0 },
  compact: { type: Boolean, default: false },
});

const origin = computed(() => Number(props.quote.originPrice ?? props.origin ?? 0));
const trip = computed(() => Number(props.quote.tripPrice ?? props.tripPrice ?? origin.value));
const member = computed(() => Number(props.quote.memberPrice ?? props.memberPrice ?? trip.value));
const student = computed(() => Number(props.quote.studentPrice ?? props.studentPrice ?? trip.value));
const deal = computed(() => trip.value < origin.value);
const showOrigin = computed(() => origin.value > 0 || trip.value === 0);
</script>
