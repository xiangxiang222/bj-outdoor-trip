<template>
  <div v-if="videos.length">
    <div class="h2">线路视频</div>
    <div class="video-list">
      <div v-for="(v, i) in videos" :key="v.url + i" class="video-card" :class="v.provider">
        <div v-if="v.kind === 'iframe'" class="video-frame" :class="{ portrait: v.layout === 'portrait' || v.provider === 'tiktok' }">
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
        <a
          v-else
          class="video-link"
          :class="'video-link-' + (v.provider || 'link')"
          :href="v.watchUrl || v.url"
          target="_blank"
          rel="noreferrer"
        >
          <strong>打开{{ v.label || "视频" }}观看</strong>
          <span v-if="v.provider === 'douyin'">看路况与风景，再回来报名</span>
          <span v-else-if="v.provider === 'tiktok'">在 TikTok 打开这条线路实拍</span>
        </a>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  videos: { type: Array, default: () => [] },
});
</script>
