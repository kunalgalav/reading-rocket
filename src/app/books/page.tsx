import { listBooks } from "@/lib/service";
import { Bookshelf } from "./bookshelf";

export const dynamic = "force-dynamic";

export default async function BooksPage() {
  const books = await listBooks();
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black">My bookshelf 📚</h1>
      <Bookshelf initial={books} />
    </div>
  );
}
