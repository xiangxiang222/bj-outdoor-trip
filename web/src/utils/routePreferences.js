import { onMounted, onUnmounted, ref, watch } from "vue";
import http from "@/api/http";

export const PRIMARY_ROUTE_PREFERENCES = [
  { key: "great-wall", name: "长城", primary: true, count: null },
  { key: "hiking", name: "徒步登山", primary: true, count: null },
  { key: "coast", name: "海边", primary: true, count: null },
];

export function preferenceName(options, key) {
  return options.find((option) => option.key === key)?.name || PRIMARY_ROUTE_PREFERENCES.find((option) => option.key === key)?.name || key;
}

export function routeBaseParams(q, days) {
  const params = {};
  if (days) params.days = days;
  if (q.trim()) params.q = q.trim();
  return params;
}

function checkedPreferences(data) {
  if (!data || !Array.isArray(data.options) || !Number.isInteger(data.total) || data.total < 0) throw new Error("Invalid preferences");
  const keys = new Set();
  const options = data.options.map((option) => {
    if (!option || typeof option.key !== "string" || !option.key || keys.has(option.key) || typeof option.name !== "string" || !option.name.trim() || typeof option.primary !== "boolean" || !Number.isInteger(option.count) || option.count < 0) throw new Error("Invalid preference option");
    keys.add(option.key);
    return { key: option.key, name: option.name, primary: option.primary, count: option.count };
  });
  return { options, total: data.total };
}

// Cards and the catalog share one inventory, counted without the selected preference.
export function useRoutePreferences(query, days) {
  const options = ref(PRIMARY_ROUTE_PREFERENCES.map((option) => ({ ...option })));
  const total = ref(null);
  const loading = ref(false);
  const error = ref(false);
  const loaded = ref(false);
  let requestId = 0;
  let disposed = false;

  async function load() {
    const current = ++requestId;
    loading.value = true;
    error.value = false;
    total.value = null;
    options.value = options.value.map((option) => ({ ...option, count: null }));
    try {
      const response = await http.get("/route-preferences", { params: routeBaseParams(query.value, days.value) });
      if (disposed || current !== requestId) return;
      const inventory = checkedPreferences(response.data);
      options.value = inventory.options;
      total.value = inventory.total;
      loaded.value = true;
    } catch {
      if (!disposed && current === requestId) error.value = true;
    } finally {
      if (!disposed && current === requestId) loading.value = false;
    }
  }

  watch([() => query.value.trim(), days], load);
  onMounted(load);
  onUnmounted(() => { disposed = true; requestId++; });
  return { options, total, loading, error, loaded, load };
}
