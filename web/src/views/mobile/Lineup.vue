<template>
  <div class="lineup-page">
    <p v-if="trips.length" class="muted lineup-lead">扫码打开的就是海报上这些团</p>
    <article class="feed-card" v-for="s in trips" :key="s.id" @click="$router.push('/m/schedule/' + s.id)">
      <div class="feed-cover">
        <img v-if="coverOf(s)" :src="coverOf(s)" :alt="s.route?.title || ''" />
        <div v-else class="feed-ph">{{ coverMark(s) }}</div>
        <div class="feed-boarded">{{ boardedLine(s) }}</div>
      </div>
      <div class="feed-body">
        <p class="feed-when">{{ feedWhen(s.startDate, s.meetupTime) }} · {{ s.city || s.route?.region }}</p>
        <h3 class="feed-title"><TripKind :kind="s.kind" :type="s.organizerType" :channel="s.channel" /> {{ s.route?.title }}</h3>
        <p class="feed-host">{{ hostName(s) }}<template v-if="s.meetupPoint"> · {{ s.meetupPoint }}</template></p>
        <p class="feed-tagline" v-if="taglineOf(s)">{{ taglineOf(s) }}</p>
        <p class="feed-price">
          <template v-if="isFreeOffer(s)">免费</template>
          <template v-else>
            <b>¥{{ s.quote?.originPrice }}</b>
            <span>会员 ¥{{ s.quote?.memberPrice }}</span>
          </template>
        </p>
      </div>
    </article>
    <LoadRow v-if="!ready" />
    <div v-else-if="!trips.length" class="card"><div class="pad">这批团已经结束或不存在</div></div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import http from "@/api/http";
import TripKind from "@/components/TripKind.vue";
import LoadRow from "@/components/LoadRow.vue";
import { boardedLine, coverMark, coverOf, feedWhen, hostName, isFreeOffer, taglineOf } from "@/utils/feedCard";
import { processFeed } from "@/utils/feedList";

const route = useRoute();
const trips = ref([]);
const ready = ref(false);

onMounted(async () => {
  try {
    const res = await http.get("/poster-lineups/" + encodeURIComponent(String(route.params.code || "")));
    trips.value = processFeed(res.data?.trips || [], { sort: "soon" });
  } catch {
    trips.value = [];
  } finally {
    ready.value = true;
  }
});
</script>

<style scoped>
.lineup-lead { margin: 12px 16px 4px; }
</style>
