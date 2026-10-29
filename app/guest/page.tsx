import { redirect } from "next/navigation";
export default function Guest() {
  redirect("/guest/dashboard");
}
