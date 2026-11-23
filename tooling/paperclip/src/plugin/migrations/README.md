# Agent tools migrations

Empty on purpose. Paperclip lets a plugin read its core tables (`coreReadTables`) only when the
manifest declares a database with a migrations folder. The Agent tools plugin keeps nothing in its
own schema; the Worker agents page only reads (HAL-16249).
