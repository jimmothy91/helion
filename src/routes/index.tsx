import { createFileRoute } from "@tanstack/react-router";
import { HelionApp } from "@/game/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <HelionApp />;
}
