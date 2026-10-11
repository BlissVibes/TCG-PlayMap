/**
 * THE COMMITTED DATA, IMPORTED DIRECTLY. For code that runs at build time or
 * in tests: the test suites, and the static version.json route.
 *
 * NEVER import this from a component or from app/page.tsx. Importing the JSON
 * is what used to put every shop and event inside the page's JavaScript; the
 * browser gets the data from /data/*.json through lib/data.ts instead.
 */
import SHOPS from "@/data/shops.json";
import EVENTS from "@/data/events.json";
import LOG from "@/data/calendar_log.json";
import type { CalendarLogEntry, DataSource } from "./data";
import type { PlayEvent, Shop } from "./schedule";

export const jsonDataSource: DataSource = {
  async load() {
    return {
      shops: SHOPS as Shop[],
      events: EVENTS as PlayEvent[],
      log: LOG as CalendarLogEntry[],
    };
  },
};
