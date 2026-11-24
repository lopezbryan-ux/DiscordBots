# Book-Bot

Bot for my friends to use to view, store, nominate our books

This package lives in `DiscordBots/BookBot`. Run package commands from this
directory, or use root commands such as `npm run build:bookbot` and
`npm run test:bookbot`. See the [monorepo guide](../README.md) for shared setup
and PM2 configuration. Dependencies and builds remain local to this package.

For a new checkout, install the locked dependencies and create the local
configuration:

```bash
npm ci
cp .env.example .env
chmod 600 .env
```

Fill in the bot token, application ID, MongoDB connection, and server IDs before
building or deploying. The template IDs are fictional. To build and run the
offline tests, use `npm run build` and `npm test`. Follow the
[deployment workflow](SKILL.md) to start or restart the live bot.

To register slash commands in multiple servers, set `GUILD_IDS` in `.env` to a comma-separated list of server IDs. Invite and authorize Book-Bot in each server before deploying. `GUILD_IDS` takes precedence over the legacy single-server `GUILD_ID` setting. Restart the running bot using `SKILL.md` to rebuild and register commands in every configured server.

Libraries are separate by default. To share an existing library, set `BOOK_LIBRARY_ALIASES` in `.env` to a JSON object mapping each linked server to the server that owns the existing books and ratings. For example:

```dotenv
BOOK_LIBRARY_ALIASES={"100000000000000003":"100000000000000002"}
```

Both servers then use the owner's existing book IDs, ratings, reviews, and leaderboards. Adding, editing, rating, or removing a book or rating in either server updates that same library. Existing deletion protection for rated books still applies. Cached views refresh for both servers after changes. Polls, nominations, votes, and announcements stay in their original server; poll winners are saved to the shared library. Servers absent from the mapping keep separate libraries. Map aliases directly to an owner without chains or cycles, and restart Book-Bot after changing configuration. Linking does not migrate records: use an empty secondary library, or merge any existing records before linking it.

`/book-list` shows up to 10 books per page, with newest added first by default. Use Previous and Next to browse the full library, and the sort menu to rearrange it. Changing the sort starts at page 1.

Use `/update-book` to change an existing book's title, author, or cover image. Choose the book from the `title` suggestions, then provide `new-title`, `author`, `image-url`, or any combination. Omitted fields keep their current values. Title changes preserve the book's ID, ratings, reviews, and rating timestamps.

Example: `/update-book title:The Cipher author:Kathe Koja image-url:https://example.com/cover.jpg`

Rename example: `/update-book title:The Cipher new-title:The Cipher (1991)`

Ratings and reviews reference each book's MongoDB `bookId`. The `title` suggestions display book names and submit stable IDs; an unambiguous manually entered title still works. Correcting book metadata keeps the same review relationship.

Use `/start-book-poll` to open nominations. The **first successful nomination** starts **24 hours of nominations**, followed automatically by **24 hours of voting**. Until that first nomination, the round waits without a deadline. Later nominations, replacements, and removals do not reset the timer, even if all nominations are removed. The command no longer needs an `hours` option. Choose `type:ranked` for a ranked vote; the default is a regular vote for one book. Members use `/nominate-book` during the nomination window, and can replace their nomination or use `/remove-nomination` before the deadline. Each member gets one nomination; the poll creator can nominate multiple books. Voting is unavailable during nominations, and the book list locks when nominations close.

At the nomination deadline, the bot turns the nomination message into the voting poll and posts a link to it in the same channel. If all nominations were removed, it closes the round without a vote. Ranked rounds with fewer than three nominations use a regular vote so every ballot can be completed. The creator can use `/close-book-poll` to cancel nominations (including a round waiting for its first nomination) or end voting early; closing manually does not add a winner to the library.

The bot checks deadlines on startup and every minute. Nomination and voting deadlines are enforced even between checks. If the bot was offline when nominations ended, voting opens when it returns and lasts a full 24 hours from then. Deadlines are saved in the database and survive restarts. Polls already underway when this change is deployed keep their existing deadline and nomination behavior.

The poll message shows whether it is waiting for the first nomination, counting down, accepting votes, or closed. Nomination changes refresh the list and deadline; failed message updates are retried on the next scheduled check. Long lists use pages, and long titles or cover links may be shortened or omitted in the poll preview to fit Discord's limits; the saved nominations keep their full details.

Book polls stop accepting votes at their scheduled deadline. Ranked ballots count only when all three picks are valid and distinct; partial or duplicate ballots can be corrected before voting ends and contribute no points until complete. Final announcements show only counted votes. Voting controls identify nominations by ID, so removing a book from a legacy poll cannot redirect an old selection to another book. Replacing a nominated book in a legacy poll clears its previous votes. Existing saved votes remain compatible, and outdated voting controls ask members to choose again.

Winner announcements show the winning book and the runner-up with their final scores. All books tied for second place are listed as runners-up; only the winner is added to the club list. Each message shows at most four voters and keeps each ballot complete. Long ballots use smaller groups, the embed description, or a text attachment when needed. Tie announcements also preserve the full counted vote list in continuation messages. Only the first message mentions `@everyone`.

For an existing database, build the code and run `npm run migrate-rating-book-ids -- --dry-run` against a saved baseline under `.local/review-baselines/`. Stop `book-bot` before running `npm run migrate-rating-book-ids -- --apply`, then follow `SKILL.md` to restart it. The migration adds only `bookId`, preserves every original record and field, verifies the saved baseline, and creates a unique index for each server/book/member. Use `npm run migrate-rating-book-ids -- --verify` to compare again. The default mode is a dry run; ambiguous matches or changed baseline records block migration. Reports and before/after snapshots stay local and are excluded from Git.
