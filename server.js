require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// ========== CONNEXION MONGODB ==========
const mongoURI = process.env.MONGODB_URI;

mongoose.connect(mongoURI)
    .then(() => console.log("🚀 TA'BIA DB : Connectée à MongoDB Atlas !"))
    .catch(err => { 
        console.error("❌ Erreur critique de connexion DB:", err); 
        process.exit(1); 
    });

// ========== MODÈLES DE DONNÉES ==========

// 1. Produits
const Product = mongoose.model('Product', new mongoose.Schema({
    id: Number, 
    nom: String, 
    prix: Number, 
    stock: Number, 
    categorie: String, 
    seuilAlerte: { type: Number, default: 10 }, 
    unite: String,
    fournisseur: String
}));

// 2. Dépenses
const Expense = mongoose.model('Expense', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    categorie: String, 
    description: String, 
    montant: Number, 
    mode: String
}));

// 3. Commandes Cuisine (CORRIGÉ : id ajouté pour éviter l'erreur BSON)
const Order = mongoose.model('Order', new mongoose.Schema({
    id: Number, 
    numero: String, 
    date: String, 
    timestamp: Number, 
    articles: Array,
    numeroTable: String, 
    statut: { type: String, default: 'en_attente' }, 
    total: Number
}));

// 4. Codes de Tables
const TableCode = mongoose.model('TableCode', new mongoose.Schema({
    numero: Number, 
    code: String, 
    lastUpdated: Number
}));

// ========== MIDDLEWARES ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const CAISSE_PASSWORD = process.env.CAISSE_PASSWORD || '1234';

// ========== API ROUTES ==========

// --- STOCK ---
app.get('/api/stock', async (req, res) => {
    try {
        const produits = await Product.find({});
        res.json(produits);
    } catch (err) { res.status(500).json(err); }
});

app.post('/api/stock/decrementer', async (req, res) => {
    try {
        const { articles } = req.body;
        for (let art of articles) {
            await Product.findOneAndUpdate({ id: art.id }, { $inc: { stock: -art.quantite } });
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json(err); }
});

// --- DÉPENSES ---
app.get('/api/depenses', async (req, res) => {
    try {
        const dep = await Expense.find({}).sort({ _id: -1 });
        res.json(dep);
    } catch (err) { res.status(500).json(err); }
});

app.post('/api/depenses', async (req, res) => {
    try {
        const newDep = new Expense(req.body);
        await newDep.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json(err); }
});

// --- CUISINE (COMMANDES) ---
app.post('/api/commandes', async (req, res) => {
    try {
        const cmd = new Order({
            id: Date.now(),
            numero: 'CMD' + Math.floor(Math.random() * 10000),
            date: new Date().toLocaleString('fr-FR'),
            timestamp: Date.now(),
            articles: req.body.articles,
            numeroTable: req.body.numeroTable,
            total: req.body.total,
            statut: 'en_attente'
        });
        await cmd.save();
        io.emit('nouvelle_commande', cmd);
        res.status(201).json(cmd);
    } catch (err) {
        console.error("Erreur commande:", err);
        res.status(500).json({ error: "Erreur validation" });
    }
});

app.get('/api/commandes', async (req, res) => {
    try {
        const orders = await Order.find({ statut: { $ne: 'paye' } });
        res.json(orders);
    } catch (err) { res.status(500).json(err); }
});

app.put('/api/commandes/:id/statut', async (req, res) => {
    try {
        const cmd = await Order.findOneAndUpdate({ id: req.params.id }, { statut: req.body.statut }, { new: true });
        io.emit('mise_a_jour_commande', cmd);
        res.json(cmd);
    } catch (err) { res.status(500).json(err); }
});

// --- CODES TABLES ---
app.get('/api/numbers', async (req, res) => {
    try {
        const tables = await TableCode.find({}).sort({ numero: 1 });
        res.json(tables);
    } catch (err) { res.status(500).json(err); }
});

app.post('/api/numbers/refresh/:numero', async (req, res) => {
    try {
        const num = parseInt(req.params.numero);
        const newCode = Math.floor(Math.random() * 90000 + 10000).toString();
        const updated = await TableCode.findOneAndUpdate(
            { numero: num }, 
            { code: newCode, lastUpdated: Date.now() }, 
            { upsert: true, new: true }
        );
        res.json(updated);
    } catch (err) { res.status(500).json(err); }
});

// --- AUTH ---
app.post('/api/caisse/verify', (req, res) => res.json({ success: req.body.password === CAISSE_PASSWORD }));

// ========== INITIALISATION & DÉMARRAGE ==========

async function seedDatabase() {
    const count = await Product.countDocuments();
    if (count === 0) {
        const monMenu = [
            { id: 1, nom: "Espresso", stock: 200, seuilAlerte: 20, prix: 2.500, unite: "tasse", categorie: "cafe", fournisseur: "Café Select" },
            { id: 2, nom: "Capucin", stock: 200, seuilAlerte: 20, prix: 3.000, unite: "tasse", categorie: "cafe", fournisseur: "Café Select" },
            { id: 3, nom: "Direct", stock: 150, seuilAlerte: 20, prix: 3.500, unite: "tasse", categorie: "cafe", fournisseur: "Café Select" },
            { id: 4, nom: "Caramel Macchiato", stock: 50, seuilAlerte: 10, prix: 6.500, unite: "verre", categorie: "cafe", fournisseur: "Café Select" },
            { id: 5, nom: "Thé Vert à la Menthe", stock: 150, seuilAlerte: 20, prix: 2.500, unite: "verre", categorie: "the", fournisseur: "Herboristerie Centrale" },
            { id: 6, nom: "Thé aux Pignons", stock: 80, seuilAlerte: 10, prix: 6.500, unite: "verre", categorie: "the", fournisseur: "Marché Sec" },
            { id: 7, nom: "Thé aux Amandes", stock: 80, seuilAlerte: 10, prix: 6.000, unite: "verre", categorie: "the", fournisseur: "Marché Sec" },
            { id: 8, nom: "Infusion Camomille", stock: 50, seuilAlerte: 10, prix: 4.000, unite: "tasse", categorie: "the", fournisseur: "Herboristerie Centrale" },
            { id: 9, nom: "Citronnade Fraîche", stock: 60, seuilAlerte: 10, prix: 4.500, unite: "verre", categorie: "boissons", fournisseur: "Fruitière" },
            { id: 10, nom: "Mojito Virgin", stock: 40, seuilAlerte: 10, prix: 6.500, unite: "verre", categorie: "boissons", fournisseur: "Fruitière" },
            { id: 11, nom: "Jus de Fraise Frais", stock: 30, seuilAlerte: 5, prix: 6.000, unite: "verre", categorie: "boissons", fournisseur: "Fruitière" },
            { id: 12, nom: "Boisson Gazeuse", stock: 150, seuilAlerte: 24, prix: 3.000, unite: "canette", categorie: "boissons", fournisseur: "Grossiste Boissons" },
            { id: 13, nom: "Eau Minérale", stock: 200, seuilAlerte: 50, prix: 1.500, unite: "bouteille", categorie: "boissons", fournisseur: "Grossiste Boissons" },
            { id: 14, nom: "Cheesecake Speculoos", stock: 15, seuilAlerte: 3, prix: 8.500, unite: "part", categorie: "dessert", fournisseur: "Pâtisserie Fine" },
            { id: 15, nom: "Tiramisu Maison", stock: 20, seuilAlerte: 4, prix: 7.500, unite: "part", categorie: "dessert", fournisseur: "Pâtisserie Fine" },
            { id: 16, nom: "Crêpe Chocolat", stock: 50, seuilAlerte: 10, prix: 6.000, unite: "pièce", categorie: "dessert", fournisseur: "Cuisine" },
            { id: 17, nom: "Gaufre Nutella", stock: 40, seuilAlerte: 10, prix: 7.000, unite: "pièce", categorie: "dessert", fournisseur: "Cuisine" },
            { id: 18, nom: "Toast Fromage Dinde", stock: 40, seuilAlerte: 10, prix: 5.500, unite: "pièce", categorie: "sale", fournisseur: "Boulangerie Centrale" },
            { id: 19, nom: "Club Sandwich Thon", stock: 30, seuilAlerte: 5, prix: 7.500, unite: "pièce", categorie: "sale", fournisseur: "Boulangerie Centrale" },
            { id: 20, nom: "Panini Poulet Fromage", stock: 30, seuilAlerte: 5, prix: 8.000, unite: "pièce", categorie: "sale", fournisseur: "Boulangerie Centrale" }
        ];
        await Product.insertMany(monMenu);
        console.log("✅ Menu initial importé avec succès !");
    }
}

// Sécurité : On attend que la DB soit prête avant de lancer le serveur HTTP
mongoose.connection.once('open', () => {
    server.listen(PORT, () => {
        console.log(`🚀 Serveur en ligne : port ${PORT}`);
        seedDatabase();
    });
});