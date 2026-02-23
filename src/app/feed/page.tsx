import { redirect } from "next/navigation";

type FeedPageRedirectProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FeedPageRedirect({ searchParams }: FeedPageRedirectProps) {
  const query = await searchParams;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") {
      params.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    }
  }

  const queryString = params.toString();
  redirect(queryString.length > 0 ? `/?${queryString}` : "/");
}
