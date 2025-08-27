const mongoose = require('mongoose');
require('dotenv').config();

const dropProblematicIndexes = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');

        // Get the services collection
        const db = mongoose.connection.db;
        const collection = db.collection('services');

        // Get all indexes
        const indexes = await collection.indexes();
        console.log('Current indexes:', indexes.map(idx => ({ name: idx.name, key: idx.key })));

        // Drop 2dsphere indexes
        for (const index of indexes) {
            if (index.key && index.key.location === '2dsphere') {
                console.log(`Dropping index: ${index.name}`);
                await collection.dropIndex(index.name);
                console.log(`Successfully dropped index: ${index.name}`);
            }
        }

        // Recreate the correct indexes
        await collection.createIndex({ category: 1, isActive: 1 });
        await collection.createIndex({ provider: 1 });
        await collection.createIndex({ 'location.city': 1 });
        await collection.createIndex({ 'location.state': 1 });
        await collection.createIndex({ tags: 1 });
        await collection.createIndex({ isFeatured: 1, isActive: 1 });
        await collection.createIndex({ 'price.amount': 1 });
        await collection.createIndex({ 'rating.average': -1 });

        console.log('Indexes recreated successfully');

        // Get updated indexes
        const updatedIndexes = await collection.indexes();
        console.log('Updated indexes:', updatedIndexes.map(idx => ({ name: idx.name, key: idx.key })));

        console.log('Index cleanup completed successfully');
    } catch (error) {
        console.error('Error dropping indexes:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
};

// Run the script
dropProblematicIndexes();
