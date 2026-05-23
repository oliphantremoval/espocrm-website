'use client';

import { useState } from 'react';

export default function Home() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    message: '',
  });

  const [submitted, setSubmitted] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const response = await fetch('/api/lead', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      setSubmitted(true);

      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        company: '',
        message: '',
      });
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900">

      <section className="bg-[#0B1F3A] text-white py-24 px-6">
        <div className="max-w-6xl mx-auto text-center">

          <img
            src="/logo.png"
            alt="Oliphant Removal"
            className="w-64 mx-auto mb-8"
          />

          <h1 className="text-5xl font-bold mb-6">
            Oliphant Removal
          </h1>

          <p className="text-xl max-w-3xl mx-auto text-gray-300">
            Professional junk removal, cleanouts, hauling,
            and property cleanup services.
          </p>

        </div>
      </section>

      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">

          <div className="bg-gray-50 p-8 rounded-2xl shadow-lg">
            <h3 className="text-2xl font-bold mb-4">
              Residential Removal
            </h3>

            <p>
              Furniture, appliances, garage cleanouts,
              attic junk, and household debris removal.
            </p>
          </div>

          <div className="bg-gray-50 p-8 rounded-2xl shadow-lg">
            <h3 className="text-2xl font-bold mb-4">
              Commercial Cleanup
            </h3>

            <p>
              Office cleanouts, warehouse junk removal,
              storage units, and contractor debris hauling.
            </p>
          </div>

          <div className="bg-gray-50 p-8 rounded-2xl shadow-lg">
            <h3 className="text-2xl font-bold mb-4">
              Same-Day Service
            </h3>

            <p>
              Fast turnaround with dependable scheduling
              and professional customer support.
            </p>
          </div>

        </div>
      </section>

      <section className="py-20 px-6 bg-gray-100">
        <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-2xl p-10">

          <h2 className="text-4xl font-bold text-center mb-4">
            Request a Free Quote
          </h2>

          <p className="text-center text-gray-600 mb-10">
            Fill out the form below and we’ll contact you shortly.
          </p>

          {submitted && (
            <div className="bg-green-100 text-green-800 p-4 rounded-xl mb-6 text-center">
              Your request was submitted successfully.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            <div className="grid md:grid-cols-2 gap-5">

              <input
                type="text"
                name="firstName"
                placeholder="First Name"
                value={formData.firstName}
                onChange={handleChange}
                className="w-full border border-gray-300 p-4 rounded-xl"
                required
              />

              <input
                type="text"
                name="lastName"
                placeholder="Last Name"
                value={formData.lastName}
                onChange={handleChange}
                className="w-full border border-gray-300 p-4 rounded-xl"
                required
              />

            </div>

            <input
              type="email"
              name="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleChange}
              className="w-full border border-gray-300 p-4 rounded-xl"
              required
            />

            <input
              type="text"
              name="phone"
              placeholder="Phone Number"
              value={formData.phone}
              onChange={handleChange}
              className="w-full border border-gray-300 p-4 rounded-xl"
            />

            <input
              type="text"
              name="company"
              placeholder="Address or Company"
              value={formData.company}
              onChange={handleChange}
              className="w-full border border-gray-300 p-4 rounded-xl"
            />

            <textarea
              name="message"
              placeholder="Tell us what needs removed"
              value={formData.message}
              onChange={handleChange}
              className="w-full border border-gray-300 p-4 rounded-xl h-40"
            />

            <button
              type="submit"
              className="bg-red-700 hover:bg-red-800 text-white px-8 py-4 rounded-xl w-full text-lg font-semibold"
            >
              Get My Free Quote
            </button>

          </form>

        </div>
      </section>

    </main>
  );
}