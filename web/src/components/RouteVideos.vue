<template>
  <div v-if="videos.length">
    <div class="h2">线路视频</div>
    <div class="video-list">
      <div v-for="(v, i) in videos" :key="v.url + i" class="video-card">
        <div v-if="v.kind === 'iframe'" class="video-frame">
          <iframe
            :src="v.embedUrl"
            :title="(v.label || '视频') + ' 播放器'"
            allow="fullscreen; encrypted-media; picture-in-picture"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
          />
        </div>
        <div v-else-if="v.kind === 'video'" class="video-frame">
          <video :src="v.embedUrl" controls playsinline />
        </div>
        <a v-else class="video-link" :href="v.url" target="_blank" rel="noreferrer">打开{{ v.label || "视频" }}观看</a>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  videos: { type: Array, default: () => [] },
});
</script>
