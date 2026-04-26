CREATE DATABASE pantry;
\c pantry;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Link users to a household
CREATE TABLE households (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(255) NOT NULL DEFAULT 'inactive',
    created_at TIMESTAMP DEFAULT NOW(),
    code VARCHAR(255)
);
--Link users to
CREATE TABLE household_users (
    id SERIAL PRIMARY KEY,
    household_id INT NOT NULL,
    user_id INT NOT NULL,
    role VARCHAR(255) NOT NULL DEFAULT 'member',
    status VARCHAR(255) NOT NULL DEFAULT 'inactive',
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (household_id, user_id)
);
CREATE TABLE food_catalog (
    id SERIAL PRIMARY KEY,
    usda_fdc_id INT UNIQUE,
    name VARCHAR(255) NOT NULL,
    calories INT,
    protein INT,
    carbs INT,
    fat INT,
    sugar INT,
    fiber INT,
    sodium INT,
    iron INT
);

CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    household_id INT NOT NULL,
    food_id INT NOT NULL,
    quantity INT NOT NULL,
    expiration_date DATE,
    purchase_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
    FOREIGN KEY (food_id) REFERENCES food_catalog(id)
);

-- Smart Pantry production schema lives in Supabase. For shopping list + RLS, run:
--   db/migrations/add_shopping_list.sql