import type { Metadata } from "next";
import { Embertop } from "./Embertop";

export const metadata: Metadata = {
  title: {
    absolute: "Embertop · Every request leaves a spark",
  },
  description:
    "Ambient observability for people who run things. Every request is a spark, CPU lifts the flame, and memory keeps the ember bed glowing.",
};

export default function Home() {
  return <Embertop />;
}
