export function requireLogin(store, router, route) {
  if (store.token) return true;
  router.replace({
    path: "/m/login",
    query: { redirect: route.fullPath || "/m/mine" },
  });
  return false;
}
