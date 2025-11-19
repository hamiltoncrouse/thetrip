import { TripDashboard } from "@/components/trip-dashboard";

type DashboardPageProps = {
  searchParams: Promise<{ tripId?: string; view?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const normalizedView = params?.view === "calendar" ? "calendar" : "timeline";
  return <TripDashboard initialTripId={params?.tripId ?? null} initialView={normalizedView} />;
}
