import { getUser } from "@/lib/auth";
import HomeClient from "./HomeClient";

export default async function Home() {
  const user = await getUser();
  return <HomeClient user={user} />;
}
