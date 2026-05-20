
import './SignUp.css'
import {Link,useNavigate} from 'react-router-dom'
import axios from 'axios'
import { useState } from 'react'

function SignUp() {
  const [name,setName] = useState('')
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [confirmPassword,setconfirmPassword] = useState('')
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!name || !email || !password || !confirmPassword) {
      alert("All fields are required");
      return;
    }

    if (password !== confirmPassword) {
      alert("Password must be same to confirmPassword");
      setPassword('');
      setconfirmPassword('');
      return;
    }

    axios.post("http://localhost:3001/api/auth/signup", {
      name,
      email,
      password
    })
    .then(result => {
      console.log(result);
      alert("SignUp successfully!");
      navigate("/");
    })
    .catch(err => {
      console.log(err);
      const errMsg = err.response?.data?.message || "SignUp failed!";
      alert(errMsg);
      setName("");
      setEmail("");
      setPassword("");
      setconfirmPassword("");
    });
  };

  return (
    <div className="arena-overlay">
      <form onSubmit={handleSubmit} className="battle-form">
        <div className="signupDiv royal-card royal-sanctuary">
          {/* Subtle Bronze Corner Rivets */}
          <div className="rivet top-left"></div>
          <div className="rivet top-right"></div>
          <div className="rivet bottom-left"></div>
          <div className="rivet bottom-right"></div>

          {/* Minimal Elegant Line-Art Crown & Shield SVG */}
          <div className="emblem-container">
            <svg className="royal-emblem" viewBox="0 0 100 100" width="70" height="70">
              {/* Soothing Bronze Line Art */}
              <path d="M 30 35 Q 50 30 70 35 Q 70 65 50 80 Q 30 65 30 35 Z" fill="none" stroke="#c5a880" strokeWidth="2.5" />
              <path d="M 38 60 L 36 46 L 44 50 L 50 40 L 56 50 L 64 46 L 62 60 Z" fill="#c5a880" stroke="none" />
              <circle cx="50" cy="72" r="3" fill="#c5a880" />
            </svg>
          </div>

          <h1 className="battle-title">CREATE ACCOUNT</h1>
          <h2 className="battle-subtitle">JOIN CHAMPIONS</h2>

          <div className="input-group">
            <label htmlFor="name">
              <span className="label-icon">👤</span> Warrior Name
            </label>
            <input 
              type="text" 
              id="name" 
              value={name} 
              placeholder="Enter name"
              onChange={(e) => setName(e.target.value)} 
              className="inputField" 
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="email">
              <span className="label-icon">✉️</span> Email Address
            </label>
            <input 
              type="email" 
              id="email" 
              value={email} 
              placeholder="Enter email"
              onChange={(e) => setEmail(e.target.value)} 
              className="inputField" 
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">
              <span className="label-icon">🔑</span> Password
            </label>
            <input  
              type="password" 
              id="password"  
              value={password} 
              placeholder="Enter password"
              onChange={(e) => setPassword(e.target.value)} 
              className="inputField" 
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="confirmPassword">
              <span className="label-icon">🛡️</span> Confirm Password
            </label>
            <input 
              type="password" 
              id="confirmPassword" 
              value={confirmPassword} 
              placeholder="Confirm password"
              onChange={(e) => setconfirmPassword(e.target.value)} 
              className="inputField"
              required
            />
          </div>

          <div className="form-action">
            <button type="submit" className="form-button battle-btn">
              <span className="btn-bevel-text">SIGN UP !</span>
            </button>
          </div>

          <p className="form-footer footer-text">
            Already registered?
            <Link to="/" className="form-link arena-link"> Login</Link>
          </p>
        </div>
      </form>
    </div>
  )
}

export default SignUp
