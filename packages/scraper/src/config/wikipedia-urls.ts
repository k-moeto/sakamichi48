import type { GroupKey } from "../types/models.js";

type WikipediaConfig = {
  discographyUrl: string;
  groupPageUrl: string;
};

export const WIKIPEDIA_URLS: Record<GroupKey, WikipediaConfig> = {
  nogizaka46: {
    discographyUrl: "https://ja.wikipedia.org/wiki/乃木坂46の作品",
    groupPageUrl: "https://ja.wikipedia.org/wiki/乃木坂46"
  },
  keyakizaka46: {
    discographyUrl: "https://ja.wikipedia.org/wiki/欅坂46",
    groupPageUrl: "https://ja.wikipedia.org/wiki/欅坂46"
  },
  sakurazaka46: {
    discographyUrl: "https://ja.wikipedia.org/wiki/櫻坂46",
    groupPageUrl: "https://ja.wikipedia.org/wiki/櫻坂46"
  },
  hinatazaka46: {
    discographyUrl: "https://ja.wikipedia.org/wiki/日向坂46",
    groupPageUrl: "https://ja.wikipedia.org/wiki/日向坂46"
  },
  akb48: {
    discographyUrl: "https://ja.wikipedia.org/wiki/AKB48の関連作品",
    groupPageUrl: "https://ja.wikipedia.org/wiki/AKB48"
  },
  ske48: {
    discographyUrl: "https://ja.wikipedia.org/wiki/SKE48の関連作品",
    groupPageUrl: "https://ja.wikipedia.org/wiki/SKE48"
  },
  nmb48: {
    discographyUrl: "https://ja.wikipedia.org/wiki/NMB48",
    groupPageUrl: "https://ja.wikipedia.org/wiki/NMB48"
  },
  hkt48: {
    discographyUrl: "https://ja.wikipedia.org/wiki/HKT48",
    groupPageUrl: "https://ja.wikipedia.org/wiki/HKT48"
  },
  stu48: {
    discographyUrl: "https://ja.wikipedia.org/wiki/STU48",
    groupPageUrl: "https://ja.wikipedia.org/wiki/STU48"
  },
  ngt48: {
    discographyUrl: "https://ja.wikipedia.org/wiki/NGT48",
    groupPageUrl: "https://ja.wikipedia.org/wiki/NGT48"
  }
};
