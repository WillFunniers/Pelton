---
title: Search
description: How Pelton searches your mail, the filters you can type, and how results are ordered.
---

# Search

Search runs against an index of the mail already on your computer. Nothing is sent to your mail provider and nothing leaves the machine, which is also why it works with the network off.

Press ++cmd+f++ (macOS) or ++ctrl+f++ (Windows and Linux) to put the cursor in the search bar above the message list. Clear it with the **✕** button or by pressing ++backspace++ until the bar is empty, and the list goes back to the mailbox you were in.

## What it matches

A query is matched against the subject, the sender, the recipients and the message body at once. A hit in the subject or the sender ranks above a hit buried in a body, so the message you meant is usually first.

Every word you type has to be there. Searching `invoice march` finds messages containing both words, not messages containing either, and the words have to appear in the same place: all of them in the subject, or all of them in the body. Common words like `the` and `for` are not indexed and are ignored if you type them.

Matching tolerates small mistakes:

| You type | You still find |
| --- | --- |
| `invoce` | Invoice |
| `invoi` | Invoice, while you are still typing |
| `invoice` | Invoices |

Typo tolerance only applies once every word is four characters or longer. Below that, one wrong letter covers so much of the language that the exact match gets pushed off the first page, so short words are matched as written.

## Filters

Beyond free text you can type filters. A filter becomes a chip as soon as you finish it, so the bar shows what is applied rather than a line of syntax.

| Filter | Narrows to |
| --- | --- |
| `from:` or `sender:` | A sender address or name |
| `to:` | A recipient, including Cc |
| `subject:` | Words in the subject |
| `has:attachment` | Messages carrying at least one attachment |
| `is:unread` | Messages you have not read |
| `after:` | Mail on or after a date |
| `before:` | Mail on or before a date |

Start typing a filter name and Pelton suggests the rest. Press ++tab++ to complete it, then type the value. A space or ++enter++ turns the finished filter into a chip.

Every filter is combined with **and**, so `from:jane invoice` finds mail from Jane that also mentions an invoice. Each filter can appear once; typing a second `from:` replaces the first. Remove a chip with its **✕**, or press ++backspace++ on an empty input to drop the last one.

!!! tip "Dates without typing them"

    The calendar button next to the search bar opens two date pickers and turns your picks into `after:` and `before:` chips. The `before:` day is included, so a range of the 1st to the 7th covers all of both days.

## How results are ordered

By default the order is **Automatic**, which reads it off the query you typed:

| What you searched | Automatic uses |
| --- | --- |
| Words | Best match |
| A date range, without words | Newest first |
| Only filters, without words | Newest first |

The reason for the split is that ranking needs something to rank. When you type words, some messages match them better than others and best match is the useful order. When the query is only `from:jane`, every result matches that filter equally well, so ranking them shuffles your mail for no visible reason and date is what you actually want.

To choose for yourself, use the sort button next to the search bar. It offers **Best match**, **Newest first**, **Oldest first**, **Subject A-Z** and **Subject Z-A**.

Your choice is remembered per kind of search, not globally. Setting **Oldest first** while working through a date range applies to date ranges from then on; a text search keeps its own order. The three are listed under **Settings, Message list, Search results**, where you can set them without running a search first, and each is stored per profile.

!!! note "Sorting by subject"

    Reply and forward prefixes are kept as part of the subject, so `Re: Invoice` sorts under **R**. Capitalisation is ignored, so `apple` and `Apple` sort together.

## Doing something with the results

A result set behaves like any other list: select rows, act on them, and use **Select all** to reach every match rather than the ones scrolled into view.

A search you run often can become a permanent entry of its own. Set **Views (preset searches)** in **Settings, Message list** to **In sidebar** or **Separate tab**, and a bookmark button appears beside the search bar that turns the current query and its chips into a saved view. The chips carry across, `has:attachment` and `is:unread` included.

You can also search from the command palette by typing `/` in front of your query. See [Command palette](command-palette.md).

## What is not in the index

Search reads mail Pelton has already synced. A first sync fetches a mailbox's newest messages rather than all of it, so older mail becomes findable once it has been pulled in. Reach the end of a mailbox to fetch the next batch, or leave **Fetch older mail automatically** on so it happens as you scroll.

Encrypted messages are findable by subject, sender and date, but not by their text, because searching their text would mean writing it into an ordinary file on the computer. **Settings, Encryption** has the switch if you want that trade; see [Encryption](encryption.md).

The result count above the list counts index matches. With `has:attachment` or `is:unread` applied the list can be shorter than that number, because those two are checked against each message after it has been ranked.

## Need help?

See [Support](../support.md).
