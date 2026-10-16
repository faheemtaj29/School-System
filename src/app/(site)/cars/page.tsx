import type { Metadata } from "next";
import { ListingsPage, type Search } from "@/components/marketplace/ListingsPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Used & new cars for sale",
  description: "Inspected dealer cars and private-seller ads with fair-price ratings and finance estimates.",
};

export default function CarsPage({ searchParams }: { searchParams: Search }) {
  return <ListingsPage type="car" searchParams={searchParams} />;
}
