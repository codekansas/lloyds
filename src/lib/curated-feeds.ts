export type CuratedFeedSeed = {
  name: string;
  url: string;
  description: string;
};

export const curatedFeedSeeds: CuratedFeedSeed[] = [
  {
    name: "LessWrong",
    url: "https://www.lesswrong.com/feed.xml",
    description: "Rationality, AI alignment, and epistemics essays.",
  },
  {
    name: "Alignment Forum",
    url: "https://www.alignmentforum.org/feed.xml",
    description: "Technical and strategic AI alignment writing.",
  },
  {
    name: "Astral Codex Ten",
    url: "https://astralcodexten.substack.com/feed",
    description: "Long-form essays across science, policy, and rationalism.",
  },
  {
    name: "Overcoming Bias",
    url: "https://www.overcomingbias.com/feed",
    description: "Economics and rationality thought experiments.",
  },
  {
    name: "Marginal Revolution",
    url: "https://marginalrevolution.com/feed",
    description: "Economics and technology commentary with frequent long-form links.",
  },
  {
    name: "Cold Takes",
    url: "https://www.cold-takes.com/feed/",
    description: "Decision-focused writing on global priorities and philanthropy.",
  },
  {
    name: "The Gradient",
    url: "https://thegradient.pub/rss/",
    description: "Machine learning essays and explainers.",
  },
];
