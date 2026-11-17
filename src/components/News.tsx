import { t } from "../i18n";
import type { News } from "../news";

/** Classes for an entry of the Workbench that is new or changed: a card, as under "Needs you". */
export function newsClass(news: News | null): string {
  return news ? `news-card ${news === "new" ? "news-new" : ""}` : "";
}

/** The word on a new or changed entry. */
export function NewsTag({ news }: { news: News | null }) {
  if (!news) return null;
  return <span className="news-tag shrink-0">{news === "new" ? t("new") : t("changed")}</span>;
}
