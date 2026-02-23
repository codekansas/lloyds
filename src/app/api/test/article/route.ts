import { NextResponse } from "next/server";

const html = `
<!doctype html>
<html>
  <head>
    <title>E2E Article</title>
  </head>
  <body>
    <article>
      <h1>Designing High-Agency Institutions</h1>
      <p>High-agency communities improve outcomes by combining rigorous epistemics with practical execution loops.</p>
      <p>Strong communities avoid performative status games and reward substantive contribution across disciplines.</p>
      <p>A useful community discussion space should combine clear standards with thoughtful context from participants.</p>
      <p>AI systems can summarize long-form writing and reduce cognitive overhead before deep reading.</p>
      <p>The most robust communities align incentives toward truth-seeking, contribution, and measurable impact.</p>
    </article>
  </body>
</html>
`;

export const GET = async () => {
  if (process.env.E2E_TEST_MODE !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
};
