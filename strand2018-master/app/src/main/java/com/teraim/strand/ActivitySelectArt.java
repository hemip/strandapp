package com.teraim.strand;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.View.OnClickListener;

import com.teraim.strand.utils.Constants;

public class ActivitySelectArt extends Activity {

	int[] knappar = {R.id.orterB,R.id.risB,R.id.graminidB,R.id.ormB,R.id.mossorB,R.id.lavarB};
	
	
	@Override
	protected void onCreate(Bundle savedInstanceState) {
		
		super.onCreate(savedInstanceState);
		
		this.setContentView(R.layout.activity_select_art);
		
		OnClickListener cl = new OnClickListener() {

			@Override
			public void onClick(View v) {
				Intent intent = new Intent(ActivitySelectArt.this, ActivityArterFaltskikt.class);
				int typ=-1;
				switch(v.getId()) {
				case R.id.orterB:
					typ = Constants.ORTER;
					break;
				case R.id.risB:
					typ = Constants.RIS;
					break;
				case R.id.graminidB:
					typ = Constants.GRAMINIDER;
					break;					
				case R.id.ormB:
					typ = Constants.ORMBUNKAR;
					break;
				case R.id.mossorB:
					typ = Constants.MOSSOR;
					break;
				case R.id.lavarB:
					typ = Constants.LAVAR;
					break;
				}
				intent.putExtra(Constants.KEY_CURRENT_TABLE, typ);
				startActivity(intent);
			}
			
		};
		
		for(int id:knappar)
			this.findViewById(id).setOnClickListener(cl);
	}
	

	
	
	
}
