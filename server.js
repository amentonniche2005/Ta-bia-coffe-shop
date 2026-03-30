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

// ========== 1. CONNEXION MONGODB ATLAS ==========
const mongoURI = process.env.MONGODB_URI;

mongoose.connect(mongoURI)
    .then(() => console.log("🚀 TA'BIA DB : Connectée avec succès !"))
    .catch(err => { 
        console.error("❌ Erreur critique de connexion DB:", err); 
        process.exit(1); 
    });

// ========== 2. MODÈLES DE DONNÉES (SCHÉMAS) ==========

// Produits du Stock
const Product = mongoose.model('Product', new mongoose.Schema({
    id: Number, 
    nom: String, 
    prix: Number, 
    stock: Number, 
    categorie: String, 
    image: { type: String, default: 'https://via.placeholder.com/150' }, // 👈 On ajoute cette ligne
    seuilAlerte: { type: Number, default: 10 }, 
    unite: String
}));

// Historique des mouvements (Entrées/Sorties/Ventes)
const Movement = mongoose.model('Movement', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    type: String, // 'ajout', 'vente', 'inventaire'
    produit: String, produitId: Number, quantite: Number,
    ancienStock: Number, nouveauStock: Number, raison: String
}));

// Audits d'Inventaire Physique
const Inventory = mongoose.model('Inventory', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    ecarts: Array
}));

// Dépenses Journalières
const Expense = mongoose.model('Expense', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    categorie: String, description: String, montant: Number, mode: String
}));

// Commandes Cuisine (Caisse -> Comptoir)
const Order = mongoose.model('Order', new mongoose.Schema({
    id: Number, numero: String, date: String, timestamp: Number, articles: Array,
    numeroTable: String, statut: { type: String, default: 'en_attente' }, total: Number
}));

// Codes de Tables (QR Codes)
const TableCode = mongoose.model('TableCode', new mongoose.Schema({
    numero: Number, code: String, lastUpdated: Number
}));

// ========== 3. MIDDLEWARES ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const CAISSE_PASSWORD = process.env.CAISSE_PASSWORD || '1234';

// ========== 4. ROUTES API (AVEC TEMPS RÉEL) ==========

// --- GESTION DU STOCK ---

// Lire tout le stock
app.get('/api/stock', async (req, res) => {
    try { res.json(await Product.find({}).sort({ id: 1 })); } catch (err) { res.status(500).json(err); }
});

// Ajouter un nouveau produit
app.post('/api/stock', async (req, res) => {
    const nouveau = new Product({ ...req.body, id: Date.now() });
    await nouveau.save();
    io.emit('update_stock'); // 📢 Signal Live
    res.json({ success: true, produit: nouveau });
});

// Modifier un produit (Éditer)
app.put('/api/stock/:id', async (req, res) => {
    const misAJour = await Product.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
    io.emit('update_stock'); // 📢 Signal Live
    res.json({ success: true, produit: misAJour });
});

// Supprimer un produit
app.delete('/api/stock/:id', async (req, res) => {
    await Product.findOneAndDelete({ id: req.params.id });
    io.emit('update_stock'); // 📢 Signal Live
    res.json({ success: true });
});

// Ajouter de la quantité (Bouton + avec historique)
app.post('/api/stock/:id/add', async (req, res) => {
    const p = await Product.findOne({ id: req.params.id });
    if (p) {
        const ancien = p.stock;
        p.stock += parseInt(req.body.quantite);
        await p.save();
        await new Movement({ 
            type: 'ajout', produit: p.nom, produitId: p.id, 
            quantite: req.body.quantite, ancienStock: ancien, 
            nouveauStock: p.stock, raison: req.body.raison || 'Réception' 
        }).save();
        io.emit('update_stock'); // 📢 Signal Live
        res.json({ success: true });
    } else { res.status(404).send(); }
});

// Décrémenter le stock (Lors d'une vente à la Caisse)
app.post('/api/stock/decrementer', async (req, res) => {
    for (let art of req.body.articles) {
        const p = await Product.findOneAndUpdate({ id: art.id }, { $inc: { stock: -art.quantite } }, { new: true });
        await new Movement({ 
            type: 'vente', produit: p.nom, produitId: art.id, 
            quantite: art.quantite, nouveauStock: p.stock, raison: "Vente" 
        }).save();
    }
    io.emit('update_stock'); // 📢 Signal Live
    res.json({ success: true });
});

// --- HISTORIQUES ET AUDITS ---

app.get('/api/stock/historique', async (req, res) => {
    res.json(await Movement.find({}).sort({ _id: -1 }).limit(100));
});

app.get('/api/stock/inventaires', async (req, res) => {
    res.json(await Inventory.find({}).sort({ _id: -1 }));
});

app.post('/api/stock/inventaire', async (req, res) => {
    const { produits } = req.body;
    const ecarts = [];
    for (let p of produits) {
        const dbP = await Product.findOne({ id: p.id });
        if (dbP) {
            const ancien = dbP.stock;
            dbP.stock = p.stockPhysique;
            await dbP.save();
            ecarts.push({ produit: dbP.nom, ancien, nouveau: p.stockPhysique, ecart: p.stockPhysique - ancien });
        }
    }
    await new Inventory({ ecarts }).save();
    io.emit('update_stock'); // 📢 Signal Live
    res.json({ success: true });
});

// --- COMMANDES ET CUISINE ---

app.post('/api/commandes', async (req, res) => {
    const cmd = new Order({ 
        ...req.body, id: Date.now(), 
        numero: 'CMD'+Math.floor(Math.random()*10000), 
        date: new Date().toLocaleString('fr-FR'), 
        timestamp: Date.now() 
    });
    await cmd.save();
    io.emit('nouvelle_commande', cmd); // 📢 Signal Live
    res.status(201).json(cmd);
});

app.get('/api/commandes', async (req, res) => {
    res.json(await Order.find({ statut: { $ne: 'paye' } }));
});

app.put('/api/commandes/:id/statut', async (req, res) => {
    const cmd = await Order.findOneAndUpdate({ id: req.params.id }, { statut: req.body.statut }, { new: true });
    io.emit('mise_a_jour_commande', cmd); // 📢 Signal Live
    res.json(cmd);
});
// --- NOUVEAU : Marquer toutes les commandes d'une table comme payées ---
app.put('/api/commandes/table/:numeroTable/paye', async (req, res) => {
    try {
        const numeroTable = req.params.numeroTable;
        // Trouve toutes les commandes de cette table qui sont en cuisine ou terminées
        const commandes = await Order.find({ numeroTable: numeroTable, statut: { $ne: 'paye' } });
        
        for (let cmd of commandes) {
            cmd.statut = 'paye'; // On change le statut
            await cmd.save();
            io.emit('mise_a_jour_commande', cmd); // 📢 Dis au Comptoir de l'effacer !
        }
        res.json({ success: true, effacees: commandes.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DÉPENSES ---
app.get('/api/depenses', async (req, res) => res.json(await Expense.find({}).sort({ _id: -1 })));
app.post('/api/depenses', async (req, res) => { await new Expense(req.body).save(); res.json({ success: true }); });

// --- QR CODES TABLES ---
app.get('/api/numbers', async (req, res) => res.json(await TableCode.find({}).sort({ numero: 1 })));
app.post('/api/numbers/refresh/:numero', async (req, res) => {
    const updated = await TableCode.findOneAndUpdate(
        { numero: req.params.numero }, 
        { code: Math.floor(Math.random()*90000+10000).toString(), lastUpdated: Date.now() }, 
        { upsert: true, new: true }
    );
    res.json(updated);
});

// --- AUTH ---
app.post('/api/caisse/verify', (req, res) => res.json({ success: req.body.password === CAISSE_PASSWORD }));

// ========== 5. INITIALISATION DU MENU (SEED) ==========

async function seedDatabase() {
    const count = await Product.countDocuments();
    if (count === 0) {
        const monMenu = [
            { id: 1, nom: "Espresso", stock: 200, seuilAlerte: 20, prix: 2.5, unite: "tasse", categorie: "cafe" },
            { id: 2, nom: "Capucin", stock: 200, seuilAlerte: 20, prix: 3.0, unite: "tasse", categorie: "cafe" },
            { id: 6, nom: "Thé aux Pignons", stock: 80, seuilAlerte: 10, prix: 6.5, unite: "verre", categorie: "the" },
            { id: 14, nom: "Cheesecake Speculoos", stock: 15, seuilAlerte: 3, prix: 8.5, unite: "part", categorie: "dessert" },
            { id: 20, nom: "Panini Poulet Fromage", stock: 30, seuilAlerte: 5, prix: 8.0, unite: "pièce", categorie: "sale" }
        ];
        await Product.insertMany(monMenu);
        console.log("✅ Menu initial injecté dans MongoDB !");
    }
}

// ========== 6. DÉMARRAGE DU SERVEUR ==========

// On attend que la connexion MongoDB soit prête avant d'ouvrir le port
mongoose.connection.once('open', () => {
    server.listen(PORT, () => {
        console.log(`🚀 TA'BIA Coffee Shop Online !`);
        console.log(`📍 Port : ${PORT}`);
        seedDatabase();
    });
});