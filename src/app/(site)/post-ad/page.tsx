import type { Metadata } from "next";
import { PostAdApp } from "@/components/marketplace/Member";

export const metadata: Metadata = {
  title: "Post a free ad — sell your car or bike",
  description: "List your car or motorbike for free and get messages from buyers.",
};

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function PostAdPage({ searchParams }: { searchParams: Search }) {
  const type = (await searchParams).type === "bike" ? "bike" : "car";
  return (
    <section className="site-section">
      <span className="site-kicker">Sell it yourself</span>
      <h2>Post a free ad</h2>
      <p className="site-lead">
        Free for private sellers: up to 5 live ads, each live for 30 days. Prefer a quick sale?{" "}
        <a href="/sell-car" className="site-link">Get a dealer offer instead →</a>
      </p>
      <PostAdApp type={type} />
    </section>
  );
}
