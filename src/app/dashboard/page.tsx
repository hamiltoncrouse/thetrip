import { TripDashboard } from "@/components/trip-dashboard";

export default function DashboardPage({
  searchParams,
}: {
  searchParams: { tripId?: string; view?: string };
}) {
  const { tripId, view } = searchParams;
  const normalizedView = view === "calendar" ? "calendar" : "timeline";
  return <TripDashboard initialTripId={tripId ?? null} initialView={normalizedView} />;
}
