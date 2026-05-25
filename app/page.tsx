'use client';

import { useState } from 'react';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    message: '',
  });

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

    setLoading(true);
    setSuccess(false);

    try {
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setSuccess(true);

        setFormData({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          company: '',
          message: '',
        });
      }
    } catch (error) {
      console.error(error);
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[#f5f7fa] text-[#111827]">
      {/* NAVBAR */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/logo.png"
              alt="Oliphant Removal"
              className="w-12 h-12 object-contain"
            />

            <div>
              <h1 className="text-3xl font-bold text-[#111827] leading-none">
                Oliphant Removal
              </h1>

              <p className="text-gray-500 text-sm mt-1">
                Tree Removal • Trimming • Storm Cleanup
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-10 text-[15px] font-medium text-gray-700">
            <a href="#services" className="hover:text-black transition">
              Services
            </a>

            <a href="#about" className="hover:text-black transition">
              About
            </a>

            <a href="#quote" className="hover:text-black transition">
              Quotes
            </a>

            <a href="#contact" className="hover:text-black transition">
              Contact
            </a>

            <a
              href="tel:3137575521"
              className="bg-green-700 hover:bg-green-800 text-white px-6 py-3 rounded-xl font-semibold transition"
            >
              Call Now
            </a>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-6xl font-black leading-tight text-[#111827]">
              Fast & Reliable
              <span className="block text-green-700 mt-2">
                Tree Removal Services
              </span>
            </h2>

            <p className="mt-8 text-xl text-gray-600 leading-relaxed max-w-xl">
              Professional tree removal, trimming, storm cleanup, hauling,
              and emergency services for residential and commercial properties.
            </p>

            <div className="flex gap-4 mt-10">
              <a
                href="#quote"
                className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-xl font-bold text-lg transition"
              >
                Get Free Quote
              </a>

              <a
                href="tel:3137575521"
                className="border border-gray-300 hover:border-gray-400 px-8 py-4 rounded-xl font-semibold text-lg transition"
              >
                Call Today
              </a>
            </div>
          </div>

          <div>
            <img
              src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=1400&auto=format&fit=crop"
              alt="Tree removal"
              className="rounded-3xl shadow-2xl w-full h-[500px] object-cover"
            />
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h3 className="text-5xl font-black text-[#111827]">
              Our Services
            </h3>

            <p className="text-gray-600 text-xl mt-5 max-w-3xl mx-auto">
              Complete tree care and removal solutions for homes and businesses.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'Tree Removal',
                desc: 'Safe and professional removal of hazardous or unwanted trees.',
              },
              {
                title: 'Tree Trimming',
                desc: 'Precision trimming to improve tree health and appearance.',
              },
              {
                title: 'Storm Cleanup',
                desc: 'Emergency cleanup and debris hauling after storms.',
              },
            ].map((service, index) => (
              <div
                key={index}
                className="bg-white rounded-3xl p-10 shadow-sm border border-gray-200 hover:shadow-xl transition"
              >
                <h4 className="text-3xl font-bold mb-5 text-[#111827]">
                  {service.title}
                </h4>

                <p className="text-gray-600 leading-relaxed text-lg">
                  {service.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* QUOTE FORM */}
      <section id="quote" className="pb-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="bg-white rounded-[32px] shadow-sm border border-gray-200 p-12">
            <h3 className="text-5xl font-black text-[#111827] mb-4">
              Request a Free Quote
            </h3>

            <p className="text-gray-500 text-lg mb-10">
              Fill out the form below and we’ll contact you shortly.
            </p>

            {success && (
              <div className="bg-green-100 text-green-800 p-5 rounded-2xl mb-8 text-center font-medium">
                Your request was submitted successfully.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-5">
                <input
                  type="text"
                  name="firstName"
                  placeholder="First Name"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  className="border border-gray-300 rounded-2xl p-5 text-lg outline-none focus:border-black"
                />

                <input
                  type="text"
                  name="lastName"
                  placeholder="Last Name"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  className="border border-gray-300 rounded-2xl p-5 text-lg outline-none focus:border-black"
                />
              </div>

              <input
                type="email"
                name="email"
                placeholder="Email Address"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded-2xl p-5 text-lg outline-none focus:border-black"
              />

              <input
                type="text"
                name="phone"
                placeholder="Phone Number"
                value={formData.phone}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded-2xl p-5 text-lg outline-none focus:border-black"
              />

              <input
                type="text"
                name="company"
                placeholder="Address or Company"
                value={formData.company}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-2xl p-5 text-lg outline-none focus:border-black"
              />

              <textarea
                name="message"
                placeholder="Tell us what needs removed"
                value={formData.message}
                onChange={handleChange}
                required
                rows={7}
                className="w-full border border-gray-300 rounded-2xl p-5 text-lg outline-none focus:border-black resize-none"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-5 rounded-2xl text-xl font-bold transition"
              >
                {loading ? 'Submitting...' : 'Get My Free Quote'}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="pb-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="bg-white rounded-[32px] shadow-sm border border-gray-200 p-12">
            <h3 className="text-5xl font-black text-[#111827] mb-8">
              Contact Us
            </h3>

            <div className="space-y-4 text-lg text-gray-700">
              <p>
                <strong>Phone:</strong> (313) 757-5521
              </p>

              <p>
                <strong>Email:</strong> info@oliphantremoval.com
              </p>

              <p>
                <strong>Service Area:</strong> Michigan and surrounding areas
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
