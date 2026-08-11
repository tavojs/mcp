import { ContentStore } from "./content.js";
import { TavoSearchIndex } from "./search.js";

export type TavoMcpRuntime = {
  store: ContentStore;
  search: TavoSearchIndex;
};

export async function createTavoMcpRuntime(
  contentPath?: string,
): Promise<TavoMcpRuntime> {
  const store = await ContentStore.load(contentPath);
  return { store, search: new TavoSearchIndex(store) };
}
