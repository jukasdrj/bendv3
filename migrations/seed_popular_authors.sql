-- Seed script: Populate authors table with 25 popular authors
-- Based on: src/config/popular-authors.js
-- Last Updated: November 29, 2025

-- Contemporary Fiction & Literary (Priority 1)
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Colleen Hoover', 'colleen hoover', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Taylor Jenkins Reid', 'taylor jenkins reid', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Kristin Hannah', 'kristin hannah', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Emily Henry', 'emily henry', 'author');

-- Fantasy & Sci-Fi (Priority 1)
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Brandon Sanderson', 'brandon sanderson', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Sarah J. Maas', 'sarah j. maas', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Rebecca Yarros', 'rebecca yarros', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Pierce Brown', 'pierce brown', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Andy Weir', 'andy weir', 'author');

-- Mystery & Thriller (Priority 1)
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Freida McFadden', 'freida mcfadden', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Riley Sager', 'riley sager', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Ruth Ware', 'ruth ware', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Lucy Foley', 'lucy foley', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Alex Michaelides', 'alex michaelides', 'author');

-- Horror & Dark Fantasy (Priority 2)
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Stephen King', 'stephen king', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Joe Hill', 'joe hill', 'author');

-- Literary & Award Winners (Priority 2)
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Celeste Ng', 'celeste ng', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Madeline Miller', 'madeline miller', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Brit Bennett', 'brit bennett', 'author');

-- Romance (Priority 1 & 2)
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Ali Hazelwood', 'ali hazelwood', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Abby Jimenez', 'abby jimenez', 'author');

-- Young Adult (Priority 2)
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Leigh Bardugo', 'leigh bardugo', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Holly Jackson', 'holly jackson', 'author');

-- Classic Modern Authors (Priority 2 & 3)
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('Neil Gaiman', 'neil gaiman', 'author');
INSERT OR IGNORE INTO authors (name, normalized_name, role) VALUES ('John Grisham', 'john grisham', 'author');
