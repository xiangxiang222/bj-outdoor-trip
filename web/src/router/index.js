import { createRouter, createWebHistory } from "vue-router";

const routes = [
  { path: "/", redirect: "/m" },
  {
    path: "/m",
    component: () => import("@/layouts/MobileLayout.vue"),
    children: [
      { path: "", name: "home", component: () => import("@/views/mobile/Home.vue") },
      { path: "activities", name: "activities", component: () => import("@/views/mobile/Activities.vue") },
      { path: "official", name: "official", component: () => import("@/views/mobile/Official.vue") },
      { path: "rules", redirect: "/m/official#rules" },
      { path: "student", name: "student", component: () => import("@/views/mobile/Student.vue") },
      { path: "group", name: "group", component: () => import("@/views/mobile/Group.vue") },
      { path: "feedback", name: "feedback", component: () => import("@/views/mobile/Feedback.vue") },
      { path: "lottery", name: "lottery", component: () => import("@/views/mobile/Lottery.vue") },
      { path: "after/:id", name: "after", component: () => import("@/views/mobile/After.vue") },
      { path: "routes", name: "routes", component: () => import("@/views/mobile/RouteList.vue") },
      { path: "route/:id", name: "route", component: () => import("@/views/mobile/RouteDetail.vue") },
      { path: "schedule/:id", name: "schedule", component: () => import("@/views/mobile/ScheduleDetail.vue") },
      { path: "enroll/:id", name: "enroll", component: () => import("@/views/mobile/Enroll.vue") },
      { path: "coupon/:code", name: "coupon", component: () => import("@/views/mobile/Coupon.vue") },
      { path: "coupons", name: "coupons", component: () => import("@/views/mobile/Coupons.vue") },
      { path: "open/:id", name: "open", component: () => import("@/views/mobile/OpenSchedule.vue") },
      { path: "publish", name: "publish", component: () => import("@/views/mobile/Publish.vue") },
      { path: "chain", name: "chain", component: () => import("@/views/mobile/Chain.vue") },
      { path: "mine", name: "mine", component: () => import("@/views/mobile/Mine.vue") },
      { path: "login", name: "login", component: () => import("@/views/mobile/Login.vue") },
      { path: "member", name: "member", component: () => import("@/views/mobile/Member.vue") },
      { path: "orders", name: "orders", component: () => import("@/views/mobile/Orders.vue") },
      { path: "favorites", name: "favorites", component: () => import("@/views/mobile/Favorites.vue") },
      { path: "stats/:id", name: "stats", component: () => import("@/views/mobile/Stats.vue") },
      { path: "guides", name: "guides", component: () => import("@/views/mobile/Guides.vue") },
      { path: "guide/:id", name: "guide", component: () => import("@/views/mobile/Guide.vue") },
      { path: "user/:id", name: "user", component: () => import("@/views/mobile/User.vue") },
    ],
  },
  { path: "/admin/login", component: () => import("@/views/admin/Login.vue") },
  { path: "/g/login", component: () => import("@/views/guide/Login.vue") },
  {
    path: "/g",
    component: () => import("@/layouts/GuideLayout.vue"),
    children: [
      { path: "", name: "guide-home", component: () => import("@/views/guide/Home.vue") },
      { path: "schedule/:id", name: "guide-schedule", component: () => import("@/views/guide/Schedule.vue") },
      { path: "schedule/:id/traveler/:enrollmentId", name: "guide-traveler", component: () => import("@/views/guide/Traveler.vue") },
    ],
  },
  {
    path: "/admin",
    component: () => import("@/layouts/AdminLayout.vue"),
    children: [
      { path: "", name: "admin-home", component: () => import("@/views/admin/Dashboard.vue") },
      { path: "routes", component: () => import("@/views/admin/Routes.vue") },
      { path: "schedules", component: () => import("@/views/admin/Schedules.vue") },
      { path: "enrollments", component: () => import("@/views/admin/Enrollments.vue") },
      { path: "coupons", component: () => import("@/views/admin/Coupons.vue") },
      { path: "users", component: () => import("@/views/admin/Users.vue") },
      { path: "tags", component: () => import("@/views/admin/Tags.vue") },
      { path: "staff", component: () => import("@/views/admin/Staff.vue") },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  if (to.path.startsWith("/admin") && to.path !== "/admin/login") {
    if (!localStorage.getItem("bj_admin_token")) return "/admin/login";
  }
  if (to.path.startsWith("/g") && to.path !== "/g/login") {
    if (!localStorage.getItem("bj_guide_token")) return "/g/login";
  }
  return true;
});

export default router;
