import type { Metadata } from "next";
import { ListingsPage, type Search } from "@/components/marketplace/ListingsPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Motorbikes for sale",
  description: "Used and new motorbikes and scooters from dealers and private sellers.",
};

export default function BikesPage({ searchParams }: { searchParams: Search }) {
  return <ListingsPage type="bike" searchParams={searchParams} />;
}
