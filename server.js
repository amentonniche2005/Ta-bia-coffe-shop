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
    .then(() => console.log("🚀 TA'BIA DB : Connectée !"))
    .catch(err => { console.error("❌ Erreur DB:", err); process.exit(1); });

// ========== MODÈLES DE DONNÉES ==========

// 1. Produits
const Product = mongoose.model('Product', new mongoose.Schema({
    id: Number, nom: String, prix: Number, stock: Number, categorie: String, 
    seuilAlerte: { type: Number, default: 10 }, unite: String, fournisseur: String
}));

// 2. Historique des Mouvements
const Movement = mongoose.model('Movement', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    type: String, // 'ajout', 'vente', 'inventaire'
    produit: String,
    produitId: Number,
    quantite: Number,
    ancienStock: Number,
    nouveauStock: Number,
    raison: String
}));

// 3. Inventaires (Audits)
const Inventory = mongoose.model('Inventory', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    ecarts: Array
}));

// 4. Dépenses / Commandes / Tables (Gardés de la version précédente)
const Expense = mongoose.model('Expense', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    categorie: String, description: String, montant: Number, mode: String
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    id: Number, numero: String, date: String, timestamp: Number, articles: Array,
    numeroTable: String, statut: { type: String, default: 'en_attente' }, total: Number
}));

const TableCode = mongoose.model('TableCode', new mongoose.Schema({
    numero: Number, code: String, lastUpdated: Number
}));

// ========== MIDDLEWARES ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const CAISSE_PASSWORD = process.env.CAISSE_PASSWORD || '1234';

// ========== API ROUTES RESTAURÉES ==========

// --- STOCK : LISTE ET AJOUT ---
app.get('/api/stock', async (req, res) => {
    const produits = await Product.find({}).sort({ id: 1 });
    res.json(produits);
});

// Route pour le bouton "+" (Ajout de stock)
app.post('/api/stock/:id/add', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { quantite, raison } = req.body;
        const produit = await Product.findOne({ id: id });
        
        if (produit) {
            const ancienStock = produit.stock;
            produit.stock += parseInt(quantite);
            await produit.save();

            // Enregistrer dans l'historique
            const mov = new Movement({
                type: 'ajout', produit: produit.nom, produitId: id,
                quantite: quantite, ancienStock: ancienStock,
                nouveauStock: produit.stock, raison: raison || 'Livraison'
            });
            await mov.save();
            res.json({ success: true, produit });
        } else { res.status(404).json({ error: "Non trouvé" }); }
    } catch (err) { res.status(500).json(err); }
});

// --- HISTORIQUE ---
app.get('/api/stock/historique', async (req, res) => {
    const hist = await Movement.find({}).sort({ _id: -1 }).limit(100);
    res.json(hist);
});

// --- INVENTAIRE (PHYSIQUE) ---
app.post('/api/stock/inventaire', async (req, res) => {
    try {
        const { produits } = req.body; // Liste des stocks physiques envoyés par le front
        const ecarts = [];

        for (let p of produits) {
            const dbProd = await Product.findOne({ id: p.id });
            if (dbProd) {
                const ancien = dbProd.stock;
                const ecart = p.stockPhysique - ancien;
                dbProd.stock = p.stockPhysique;
                await dbProd.save();

                ecarts.push({ produit: dbProd.nom, ancien, nouveau: p.stockPhysique, ecart });
                
                // Log mouvement
                await new Movement({
                    type: 'inventaire', produit: dbProd.nom, produitId: p.id,
                    quantite: Math.abs(ecart), ancienStock: ancien,
                    nouveauStock: p.stockPhysique, raison: "Régularisation"
                }).save();
            }
        }
        const inv = new Inventory({ ecarts });
        await inv.save();
        res.json({ success: true, inventaire: inv });
    } catch (err) { res.status(500).json(err); }
});

// --- VENTE (DÉCRÉMENTER) ---
app.post('/api/stock/decrementer', async (req, res) => {
    try {
        const { articles } = req.body;
        for (let art of articles) {
            const p = await Product.findOneAndUpdate(
                { id: art.id }, 
                { $inc: { stock: -art.quantite } },
                { new: true }
            );
            // Log vente
            await new Movement({
                type: 'vente', produit: p.nom, produitId: art.id,
                quantite: art.quantite, nouveauStock: p.stock, raison: "Vente Caisse"
            }).save();
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json(err); }
});

// --- AUTRES ROUTES (CUISINE, TABLES, DEPENSES) ---
app.get('/api/depenses', async (req, res) => { res.json(await Expense.find({}).sort({ _id: -1 })); });
app.post('/api/depenses', async (req, res) => { await new Expense(req.body).save(); res.json({ success: true }); });

app.post('/api/commandes', async (req, res) => {
    const cmd = new Order({ ...req.body, id: Date.now(), numero: 'CMD'+Math.floor(Math.random()*10000), date: new Date().toLocaleString(), timestamp: Date.now() });
    await cmd.save();
    io.emit('nouvelle_commande', cmd);
    res.status(201).json(cmd);
});
app.get('/api/commandes', async (req, res) => { res.json(await Order.find({ statut: { $ne: 'paye' } })); });
app.put('/api/commandes/:id/statut', async (req, res) => {
    const cmd = await Order.findOneAndUpdate({ id: req.params.id }, { statut: req.body.statut }, { new: true });
    io.emit('mise_a_jour_commande', cmd);
    res.json(cmd);
});

app.get('/api/numbers', async (req, res) => { res.json(await TableCode.find({}).sort({ numero: 1 })); });
app.post('/api/numbers/refresh/:numero', async (req, res) => {
    const updated = await TableCode.findOneAndUpdate({ numero: req.params.numero }, { code: Math.floor(Math.random()*90000+10000).toString(), lastUpdated: Date.now() }, { upsert: true, new: true });
    res.json(updated);
});

app.post('/api/caisse/verify', (req, res) => res.json({ success: req.body.password === CAISSE_PASSWORD }));

// ========== INITIALISATION ==========
async function seedDatabase() {
    const count = await Product.countDocuments();
    if (count === 0) {
        const monMenu = [
            { id: 1, nom: "Espresso", stock: 200, seuilAlerte: 20, prix: 2.5, unite: "tasse", categorie: "cafe" },
            { id: 6, nom: "Thé aux Pignons", stock: 80, seuilAlerte: 10, prix: 6.5, unite: "verre", categorie: "the" },
            { id: 14, nom: "Cheesecake Speculoos", stock: 15, seuilAlerte: 3, prix: 8.5, unite: "part", categorie: "dessert" }
        ];
        await Product.insertMany(monMenu);
        console.log("✅ Menu importé !");
    }
}

mongoose.connection.once('open', () => {
    server.listen(PORT, () => {
        console.log(`🚀 TA'BIA Online sur le port ${PORT}`);
        seedDatabase();
    });
});