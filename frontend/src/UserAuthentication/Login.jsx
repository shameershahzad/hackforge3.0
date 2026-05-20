
import './Login.css'
import {Link,useNavigate} from 'react-router-dom'
import { useState } from 'react'
import axios from 'axios'

function Login() {

  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const navigate = useNavigate()
  
  const handleSubmit = (e) => {
    e.preventDefault()

    axios.post("http://localhost:3001/api/auth/login",{email,password})
    .then(result => {
         console.log(result.data);

      if(result.data.token){
        sessionStorage.setItem("token",result.data.token)
        sessionStorage.setItem("username", result.data.user.name)  
      }
      if(result.data.message === "Success"){
        alert("Login Successfully!")
        navigate("/dashboard")
      }
    })
    .catch(err => {
      console.log(err);
      const errMsg = err.response?.data?.message || "Login Failed";
      alert(errMsg);
      if(errMsg === "Password is incorrect"){
        setPassword("")
      } else if(errMsg === "No user found"){
        navigate("/signUp")
      }
    })
  }

  return (
    <div className="arena-overlay">
      <form onSubmit={handleSubmit} className="battle-form">
        <div className="loginDiv royal-card royal-sanctuary">
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

          <h1 className="battle-title">ARENA LOGIN</h1>
          <h2 className="battle-subtitle">ROYAL CHAMPIONS</h2>

          <div className="input-group">
            <label htmlFor="email">
              <span className="label-icon">⚔️</span> Email Address
            </label>
            <input 
              type="text" 
              id="email" 
              value={email} 
              placeholder="Enter your email"
              onChange={(e) => setEmail(e.target.value)} 
              className="input-fields"
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
              placeholder="Enter your password"
              onChange={(e) => setPassword(e.target.value)} 
              className="input-fields"
              required
            />
          </div>

          <div className="btn-container">
            <button type="submit" className="loginBtn battle-btn">
              <span className="btn-bevel-text">ENTER ARENA</span>
            </button>
          </div>

          <p className="footer-text">
            New Challenger?{" "}
            <Link to="/signUp" className="arena-link">
              Create Account
            </Link>
          </p>
        </div>
      </form>
    </div>
  )
}

export default Login
