// B2B Registration Form Widget
// Compatible with Ritual Theme

(function() {
  'use strict';

  const B2B_API_BASE = window.location.origin + '/storefront-api';
  const CUSTOMER_API = window.location.origin + '/api/customers';

  // Create and inject registration form
  function createRegistrationForm() {
    const container = document.getElementById('b2b-registration-form');
    
    if (!container) {
      console.error('B2B registration container not found');
      return;
    }

    container.innerHTML = `
      <style>
        .b2b-form-container {
          max-width: 600px;
          margin: 0 auto;
          padding: 40px 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }
        .b2b-form-header {
          text-align: center;
          margin-bottom: 40px;
        }
        .b2b-form-header h2 {
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 12px;
          color: #1a1a1a;
        }
        .b2b-form-header p {
          font-size: 16px;
          color: #666;
          line-height: 1.6;
        }
        .b2b-form {
          background: #fff;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .b2b-form-group {
          margin-bottom: 24px;
        }
        .b2b-form-label {
          display: block;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 8px;
          color: #333;
        }
        .b2b-form-label.required::after {
          content: ' *';
          color: #d32f2f;
        }
        .b2b-form-input,
        .b2b-form-textarea {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e0e0e0;
          border-radius: 6px;
          font-size: 15px;
          transition: all 0.3s ease;
          font-family: inherit;
        }
        .b2b-form-input:focus,
        .b2b-form-textarea:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        .b2b-form-textarea {
          resize: vertical;
          min-height: 100px;
        }
        .b2b-form-help {
          font-size: 13px;
          color: #666;
          margin-top: 6px;
        }
        .b2b-form-submit {
          width: 100%;
          padding: 16px 32px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-top: 12px;
        }
        .b2b-form-submit:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
        }
        .b2b-form-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        .b2b-form-message {
          padding: 16px 20px;
          border-radius: 8px;
          margin-bottom: 24px;
          font-size: 15px;
        }
        .b2b-form-message.success {
          background: #d1f4e0;
          border: 2px solid #007f5f;
          color: #005a43;
        }
        .b2b-form-message.error {
          background: #fed3d1;
          border: 2px solid #d72c0d;
          color: #a01e0d;
        }
        .b2b-benefits {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 24px;
          margin: 40px 0;
        }
        .b2b-benefit-card {
          text-align: center;
          padding: 24px;
          background: #f8f9fa;
          border-radius: 8px;
        }
        .b2b-benefit-icon {
          font-size: 40px;
          margin-bottom: 16px;
        }
        .b2b-benefit-title {
          font-weight: 600;
          font-size: 18px;
          margin-bottom: 8px;
          color: #333;
        }
        .b2b-benefit-desc {
          font-size: 14px;
          color: #666;
          line-height: 1.5;
        }
        @media (max-width: 768px) {
          .b2b-form {
            padding: 24px;
          }
          .b2b-form-header h2 {
            font-size: 24px;
          }
        }
      </style>

      <div class="b2b-form-container">
        <div class="b2b-form-header">
          <h2>Apply for Wholesale Account</h2>
          <p>Join our B2B program and enjoy exclusive wholesale pricing, dedicated support, and special terms for your business.</p>
        </div>

        <div class="b2b-benefits">
          <div class="b2b-benefit-card">
            <div class="b2b-benefit-icon">💰</div>
            <div class="b2b-benefit-title">Wholesale Pricing</div>
            <div class="b2b-benefit-desc">Get exclusive discounts on all products</div>
          </div>
          <div class="b2b-benefit-card">
            <div class="b2b-benefit-icon">📦</div>
            <div class="b2b-benefit-title">Bulk Orders</div>
            <div class="b2b-benefit-desc">Order in large quantities with ease</div>
          </div>
          <div class="b2b-benefit-card">
            <div class="b2b-benefit-icon">🎯</div>
            <div class="b2b-benefit-title">Dedicated Support</div>
            <div class="b2b-benefit-desc">Priority customer service for your business</div>
          </div>
        </div>

        <div class="b2b-form">
          <div id="formMessage"></div>

          <form id="b2bRegistrationForm" novalidate>
            <div class="b2b-form-group">
              <label class="b2b-form-label required" for="email">Email Address</label>
              <input 
                type="email" 
                id="email" 
                name="email" 
                class="b2b-form-input" 
                required
                placeholder="your.email@company.com"
              >
              <div class="b2b-form-help">We'll use this to contact you about your application</div>
            </div>

            <div class="b2b-form-group">
              <label class="b2b-form-label required" for="company_name">Company Name</label>
              <input 
                type="text" 
                id="company_name" 
                name="company_name" 
                class="b2b-form-input" 
                required
                placeholder="Your Company LLC"
              >
            </div>

            <div class="b2b-form-group">
              <label class="b2b-form-label" for="tax_id">Tax ID / Business Registration</label>
              <input 
                type="text" 
                id="tax_id" 
                name="tax_id" 
                class="b2b-form-input"
                placeholder="12-3456789"
              >
              <div class="b2b-form-help">Optional but helps expedite approval</div>
            </div>

            <div class="b2b-form-group">
              <label class="b2b-form-label" for="phone">Phone Number</label>
              <input 
                type="tel" 
                id="phone" 
                name="phone" 
                class="b2b-form-input"
                placeholder="+1 (555) 123-4567"
              >
            </div>

            <div class="b2b-form-group">
              <label class="b2b-form-label" for="website">Website</label>
              <input 
                type="url" 
                id="website" 
                name="website" 
                class="b2b-form-input"
                placeholder="https://www.yourcompany.com"
              >
            </div>

            <div class="b2b-form-group">
              <label class="b2b-form-label" for="message">Tell us about your business</label>
              <textarea 
                id="message" 
                name="message" 
                class="b2b-form-textarea"
                placeholder="What type of business do you run? What products are you interested in? What's your expected order volume?"
              ></textarea>
            </div>

            <button type="submit" class="b2b-form-submit" id="submitBtn">
              Submit Application
            </button>
          </form>
        </div>
      </div>
    `;

    // Attach form submission handler
    const form = document.getElementById('b2bRegistrationForm');
    form.addEventListener('submit', handleFormSubmit);
  }

  // Handle form submission
  async function handleFormSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const submitBtn = document.getElementById('submitBtn');
    const messageDiv = document.getElementById('formMessage');

    // Collect form data
    const formData = {
      email: form.email.value.trim(),
      company_name: form.company_name.value.trim(),
      tax_id: form.tax_id.value.trim(),
      phone: form.phone.value.trim(),
      website: form.website.value.trim(),
      message: form.message.value.trim()
    };

    // Basic validation
    if (!formData.email || !formData.company_name) {
      showMessage('error', 'Please fill in all required fields.');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      showMessage('error', 'Please enter a valid email address.');
      return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      const response = await fetch(CUSTOMER_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showMessage('success', data.message || 'Thank you! Your application has been submitted successfully. We will review it and contact you soon.');
        form.reset();
        
        // Scroll to success message
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        showMessage('error', data.error || 'An error occurred. Please try again.');
      }

    } catch (error) {
      console.error('Error submitting form:', error);
      showMessage('error', 'Network error. Please check your connection and try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Application';
    }
  }

  // Show message
  function showMessage(type, message) {
    const messageDiv = document.getElementById('formMessage');
    messageDiv.className = `b2b-form-message ${type}`;
    messageDiv.textContent = message;
    messageDiv.style.display = 'block';

    // Auto-hide error messages after 5 seconds
    if (type === 'error') {
      setTimeout(() => {
        messageDiv.style.display = 'none';
      }, 5000);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createRegistrationForm);
  } else {
    createRegistrationForm();
  }

})();