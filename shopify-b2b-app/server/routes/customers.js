// server/routes/customers.js
const express = require('express');
const router = express.Router();
const sessionStorage = require('../db/sessionStorage');
const { shopifyApi } = require('@shopify/shopify-api');

// Configurar Shopify API
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SCOPES.split(','),
  hostName: process.env.HOST.replace(/https?:\/\//, ''),
  hostScheme: 'https',
  isEmbeddedApp: true,
  apiVersion: '2025-10',
});

// Obtener todos los clientes B2B
router.get('/', async (req, res) => {
  try {
    const { shop, host } = req.query;
    
    if (!shop) {
      return res.status(400).json({ 
        success: false, 
        message: 'Shop parameter is required' 
      });
    }

    // Cargar sesión de la tienda
    const storedSession = await sessionStorage.findSessionByShop(shop);
    if (!storedSession || !storedSession.access_token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Store not authenticated. Please reinstall the app.' 
      });
    }

    // Crear cliente de Shopify
    const client = new shopify.clients.Rest({
      session: {
        shop: shop,
        accessToken: storedSession.access_token,
      },
    });

    // Obtener clientes de Shopify
    const response = await client.get({
      path: 'customers',
    });

    // Filtrar clientes B2B (con tag "b2b" o "pending_approval")
    const allCustomers = response.body.customers || [];
    const b2bCustomers = allCustomers.filter(customer => 
      customer.tags && (
        customer.tags.includes('b2b') || 
        customer.tags.includes('pending_approval')
      )
    );

    // Separar pendientes de aprobados
    const pendingCustomers = b2bCustomers.filter(c => 
      c.note && c.note.includes('B2B_PENDING')
    );
    const approvedCustomers = b2bCustomers.filter(c => 
      c.tags && c.tags.includes('b2b_approved')
    );

    res.json({
      success: true,
      data: {
        all: allCustomers,
        b2b: b2bCustomers,
        pending: pendingCustomers,
        approved: approvedCustomers,
        stats: {
          totalB2B: b2bCustomers.length,
          pendingApprovals: pendingCustomers.length,
          approvedCount: approvedCustomers.length,
          customerGroups: 1, // Por defecto
          b2bOrders: 0 // Implementar después
        }
      }
    });
  } catch (error) {
    console.error('Error getting customers:', error);
    
    // Mejor manejo de errores específicos
    let statusCode = 500;
    let errorMessage = 'Error fetching customers';
    
    if (error.response) {
      statusCode = error.response.status || 500;
      errorMessage = error.response.body?.errors || error.message;
    }
    
    res.status(statusCode).json({ 
      success: false, 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Aprobar un cliente B2B
router.post('/approve', async (req, res) => {
  try {
    const { customerId, shop } = req.body;
    
    if (!customerId || !shop) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer ID and shop are required' 
      });
    }

    // Cargar sesión de la tienda
    const storedSession = await sessionStorage.findSessionByShop(shop);
    if (!storedSession || !storedSession.access_token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Store not authenticated' 
      });
    }

    // Crear cliente de Shopify
    const client = new shopify.clients.Rest({
      session: {
        shop: shop,
        accessToken: storedSession.access_token,
      },
    });

    // 1. Obtener el cliente actual
    const customerResponse = await client.get({
      path: `customers/${customerId}`,
    });
    
    const customer = customerResponse.body.customer;
    
    // 2. Preparar actualización del cliente
    const currentTags = customer.tags ? customer.tags.split(', ').filter(tag => tag) : [];
    
    // Agregar tag de aprobado y eliminar tag de pendiente
    const updatedTags = [
      ...currentTags.filter(tag => !tag.includes('pending_approval')),
      'b2b_approved'
    ];
    
    // Actualizar nota
    const currentNote = customer.note || '';
    const updatedNote = currentNote.replace('B2B_PENDING', 'B2B_APPROVED');
    
    // 3. Enviar actualización a Shopify
    const updatedCustomer = {
      customer: {
        id: customerId,
        tags: updatedTags.join(', '),
        note: updatedNote,
        metafields: [
          {
            namespace: 'b2b',
            key: 'status',
            value: 'approved',
            type: 'string',
          },
          {
            namespace: 'b2b',
            key: 'approved_at',
            value: new Date().toISOString(),
            type: 'string',
          }
        ]
      }
    };

    await client.put({
      path: `customers/${customerId}`,
      data: updatedCustomer,
    });

    // 4. Crear descuento para el cliente aprobado (beneficio B2B)
    try {
      const priceRuleData = {
        price_rule: {
          title: `B2B Discount - ${customer.email}`,
          target_type: 'line_item',
          target_selection: 'all',
          allocation_method: 'across',
          value_type: 'percentage',
          value: '-10.0', // 10% de descuento
          customer_selection: 'prerequisite',
          prerequisite_customer_ids: [parseInt(customerId)],
          starts_at: new Date().toISOString(),
          once_per_customer: true,
        }
      };

      await client.post({
        path: 'price_rules',
        data: priceRuleData,
      });
    } catch (discountError) {
      console.warn('Could not create discount (might need higher plan):', discountError);
      // Continuamos aunque falle el descuento
    }

    res.json({
      success: true,
      message: 'Customer approved successfully',
      customer: {
        id: customerId,
        email: customer.email,
        name: `${customer.first_name} ${customer.last_name}`,
        status: 'approved'
      },
    });
  } catch (error) {
    console.error('Error approving customer:', error);
    
    let statusCode = 500;
    let errorMessage = 'Error approving customer';
    
    if (error.response) {
      statusCode = error.response.status || 500;
      errorMessage = error.response.body?.errors || error.message;
    }
    
    res.status(statusCode).json({ 
      success: false, 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Formulario público de registro B2B
router.post('/b2b-signup', async (req, res) => {
  try {
    const { shop, email, firstName, lastName, company, phone, businessType, taxId } = req.body;
    
    if (!shop || !email || !firstName || !lastName || !company) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: shop, email, firstName, lastName, company' 
      });
    }

    // Cargar sesión de la tienda
    const storedSession = await sessionStorage.findSessionByShop(shop);
    if (!storedSession || !storedSession.access_token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Store not authenticated. The app needs to be installed first.' 
      });
    }

    // Crear cliente de Shopify
    const client = new shopify.clients.Rest({
      session: {
        shop: shop,
        accessToken: storedSession.access_token,
      },
    });

    // Crear cliente en Shopify con estado "pending"
    const customerData = {
      customer: {
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone: phone || '',
        note: `B2B_PENDING - Application from ${company}. Business type: ${businessType || 'not specified'}. Tax ID: ${taxId || 'not provided'}`,
        tags: 'b2b, pending_approval',
        metafields: [
          {
            namespace: 'b2b',
            key: 'company',
            value: company,
            type: 'string',
          },
          {
            namespace: 'b2b',
            key: 'business_type',
            value: businessType || 'not specified',
            type: 'string',
          },
          {
            namespace: 'b2b',
            key: 'tax_id',
            value: taxId || 'not provided',
            type: 'string',
          },
          {
            namespace: 'b2b',
            key: 'status',
            value: 'pending',
            type: 'string',
          },
          {
            namespace: 'b2b',
            key: 'application_date',
            value: new Date().toISOString(),
            type: 'string',
          }
        ]
      }
    };

    const response = await client.post({
      path: 'customers',
      data: customerData,
    });

    // Enviar correo de notificación (opcional - podrías implementarlo después)
    // await sendNotificationEmail(shop, customerData.customer);

    res.json({
      success: true,
      message: 'B2B application submitted successfully. We will review it within 2-3 business days.',
      customer: {
        id: response.body.customer?.id,
        email: email,
        name: `${firstName} ${lastName}`,
        company: company,
        status: 'pending_review'
      },
    });
  } catch (error) {
    console.error('Error in B2B signup:', error);
    
    let statusCode = 500;
    let errorMessage = 'Error submitting application';
    
    // Manejar errores específicos de Shopify
    if (error.response) {
      statusCode = error.response.status || 500;
      const shopifyError = error.response.body?.errors;
      
      if (shopifyError === 'Email has already been taken') {
        errorMessage = 'This email is already registered. Please use a different email or contact support.';
      } else if (shopifyError) {
        errorMessage = shopifyError;
      }
    }
    
    res.status(statusCode).json({ 
      success: false, 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Obtener detalles de un cliente específico
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { shop } = req.query;
    
    if (!id || !shop) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer ID and shop are required' 
      });
    }

    const storedSession = await sessionStorage.findSessionByShop(shop);
    if (!storedSession || !storedSession.access_token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Store not authenticated' 
      });
    }

    const client = new shopify.clients.Rest({
      session: {
        shop: shop,
        accessToken: storedSession.access_token,
      },
    });

    const response = await client.get({
      path: `customers/${id}`,
    });

    res.json({
      success: true,
      data: response.body.customer,
    });
  } catch (error) {
    console.error('Error getting customer details:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching customer details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
