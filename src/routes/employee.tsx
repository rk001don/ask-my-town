import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy PIN-based employee route now redirects to the new Supabase Auth staff console.
export const Route = createFileRoute("/employee")({
  head: () => ({
    meta: [
      { title: "Staff console — MyTown" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/staff" });
  },
  component: () => null,
});
